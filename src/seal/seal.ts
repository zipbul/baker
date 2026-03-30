import { RAW, SEALED } from '../symbols';
import { globalRegistry } from '../registry';
import { SealError } from '../errors';
import { _getGlobalOptions } from '../configure';
import { buildDeserializeCode } from './deserialize-builder';
import { buildSerializeCode } from './serialize-builder';
import { analyzeCircular } from './circular-analyzer';
import { validateExposeStacks } from './expose-validator';
import { isAsyncFunction } from '../utils';
import type { RawClassMeta, SealedExecutors } from '../types';
import type { SealOptions } from '../interfaces';

const BANNED_FIELD_NAMES = new Set(['__proto__', 'constructor', 'prototype']);
const PRIMITIVE_CTORS = new Set<Function>([Number, String, Boolean, Date]);

/** @internal Placeholder executor for circular dependency detection during seal */
function _circularPlaceholder(className: string): SealedExecutors<unknown> {
  const msg = `Circular dependency during seal: ${className} is still being sealed`;
  return {
    _deserialize() { throw new SealError(msg); },
    _serialize() { throw new SealError(msg); },
    _isAsync: false,
    _isSerializeAsync: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// analyzeAsync — static analysis to determine if a sealed DTO requires an async executor (C1)
// ─────────────────────────────────────────────────────────────────────────────

function analyzeAsync(merged: RawClassMeta, direction: 'deserialize' | 'serialize', visited?: Set<Function>): boolean {
  const v = visited ?? new Set<Function>();
  for (const meta of Object.values(merged)) {
    // 1. createRule async (deserialize direction only)
    if (direction === 'deserialize' && meta.validation.some(rd => rd.rule.isAsync)) return true;
    // 2. @Transform async
    const transforms = direction === 'deserialize'
      ? meta.transform.filter(td => !td.options?.serializeOnly)
      : meta.transform.filter(td => !td.options?.deserializeOnly);
    if (transforms.some(td => isAsyncFunction(td.fn))) return true;
    // 3. nested DTO async — use resolvedClass (post-normalization), fallback to fn() if not normalized
    if (meta.type?.resolvedClass) {
      const nestedClass = meta.type.resolvedClass;
      if (!v.has(nestedClass)) {
        v.add(nestedClass);
        const nestedMerged = mergeInheritance(nestedClass);
        if (analyzeAsync(nestedMerged, direction, v)) return true;
      }
    }
    // discriminator subTypes
    if (meta.type?.discriminator) {
      for (const sub of meta.type.discriminator.subTypes) {
        if (!v.has(sub.value)) {
          v.add(sub.value);
          const subMerged = mergeInheritance(sub.value);
          if (analyzeAsync(subMerged, direction, v)) return true;
        }
      }
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seal state flag
// ─────────────────────────────────────────────────────────────────────────────

let _sealed = false;

/** @internal — used by configure() to warn about post-seal calls */
export function _isSealed(): boolean { return _sealed; }

/** List of sealed classes — used by unseal to remove SEALED */
export const _sealedClasses = new Set<Function>();

// ─────────────────────────────────────────────────────────────────────────────
// _autoSeal — batch-seal the entire globalRegistry on first deserialize/serialize call
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @internal — called from deserialize/serialize.
 * No-op if already sealed.
 */
export function _autoSeal(): void {
  if (_sealed) return;

  const options = _getGlobalOptions();

  try {
    for (const Class of globalRegistry) {
      sealOne(Class, options);
    }
  } catch (e) {
    // On failure, clean up stale placeholders — prevent partial seal state
    for (const Class of globalRegistry) {
      if (Object.hasOwn(Class as object, SEALED)) {
        delete (Class as any)[SEALED];
      }
    }
    throw e;
  }

  for (const Class of globalRegistry) {
    _sealedClasses.add(Class);
    Object.freeze((Class as any)[RAW]);
  }
  globalRegistry.clear();

  _sealed = true;
}

/**
 * @internal — on-demand seal for classes registered after auto-seal via dynamic import.
 * Only operates when Class[RAW] exists and Class[SEALED] does not.
 */
export function _sealOnDemand(Class: Function): void {
  if (Object.hasOwn(Class as object, SEALED)) return;
  if (!Object.hasOwn(Class as object, RAW)) return;

  const before = new Set(_sealedClasses);
  const options = _getGlobalOptions();
  sealOne(Class, options);

  // Also clean up nested DTOs recursively sealed by sealOne
  _sealedClasses.add(Class);
  Object.freeze((Class as any)[RAW]);
  globalRegistry.delete(Class);

  // Clean up additional classes sealed recursively (freeze RAW + remove from registry) — delete after snapshot
  const newlySealed = [...globalRegistry].filter(
    C => Object.hasOwn(C as object, SEALED) && !before.has(C),
  );
  for (const C of newlySealed) {
    _sealedClasses.add(C);
    Object.freeze((C as any)[RAW]);
    globalRegistry.delete(C);
  }
}

/**
 * @internal testing only — called by unseal() in testing.ts
 */
export function _resetForTesting(): void {
  _sealed = false;
  _sealedClasses.clear();
}

/**
 * @internal — used by serialize/deserialize. Ensures and returns a sealed executor.
 */
export function _ensureSealed(Class: Function): SealedExecutors<unknown> {
  let sealed = (Class as any)[SEALED] as SealedExecutors<unknown> | undefined;
  if (!sealed) {
    _autoSeal();
    sealed = (Class as any)[SEALED];
  }
  if (!sealed) {
    _sealOnDemand(Class);
    sealed = (Class as any)[SEALED];
  }
  if (!sealed) {
    throw new SealError(`${Class.name} has no @Field decorators`);
  }
  return sealed;
}

// ─────────────────────────────────────────────────────────────────────────────
// sealOne() — seal an individual class (§4.1)
// ─────────────────────────────────────────────────────────────────────────────

function sealOne(Class: Function, options?: SealOptions): void {
  if (Object.hasOwn(Class as object, SEALED)) return; // already sealed (prevent recursion during circular references)

  // 0. Register placeholder — prevent infinite recursion on circular references
  const placeholder = _circularPlaceholder(Class.name);
  (Class as any)[SEALED] = placeholder;

  // 1. Merge inheritance metadata
  const merged = mergeInheritance(Class);

  // 1a. Banned field name check — prevent prototype pollution (C5)
  for (const key of Object.keys(merged)) {
    if (BANNED_FIELD_NAMES.has(key)) {
      throw new SealError(`${Class.name}: field name '${key}' is not allowed (reserved property name)`);
    }
  }

  // 1b. TypeDef normalization — resolve @Type/@Field type fn(), detect arrays, auto-infer nested DTOs
  //     Prevent original RAW mutation: copy type/flags before mutating (C-16 root fix)
  for (const [key, meta] of Object.entries(merged)) {
    if (!meta.type?.fn) continue;
    const typeResult = meta.type.fn();

    // Detect Map/Set collection
    if (typeResult === Map || typeResult === Set) {
      const collection = typeResult === Map ? 'Map' as const : 'Set' as const;
      const typeCopy = { ...meta.type, collection, isArray: false };
      // collectionValue thunk → cache resolvedCollectionValue
      if (meta.type.collectionValue) {
        const valCls = meta.type.collectionValue();
        if (valCls != null && typeof valCls === 'function' && !PRIMITIVE_CTORS.has(valCls)) {
          typeCopy.resolvedCollectionValue = valCls;
        }
      }
      merged[key] = { ...meta, type: typeCopy };
      continue;
    }

    const isArray = Array.isArray(typeResult);
    const resolved = isArray ? (typeResult as any[])[0] : typeResult;
    if (resolved == null || typeof resolved !== 'function') {
      throw new SealError(`${Class.name}: @Type/@Field type must return a constructor or [constructor], got ${String(resolved)}`);
    }
    // Copy type object before mutating — preserve original RAW type reference
    const typeCopy = { ...meta.type, isArray };
    if (!PRIMITIVE_CTORS.has(resolved)) {
      typeCopy.resolvedClass = resolved;
      // Automatically set validateNested flags for DTO classes
      if (!meta.flags.validateNested || !meta.flags.validateNestedEach) {
        meta.flags = { ...meta.flags };
        if (!meta.flags.validateNested) meta.flags.validateNested = true;
        if (isArray && !meta.flags.validateNestedEach) meta.flags.validateNestedEach = true;
      }
    }
    merged[key] = { ...meta, type: typeCopy };
  }

  // 2. Static validation of @Expose stacks (throws SealError on failure)
  validateExposeStacks(merged, Class.name);

  // 3. Static analysis for circular references
  const needsCircularCheck = analyzeCircular(Class);

  // 4. Seal nested @Type referenced DTOs first (recursive) — uses resolvedClass / resolvedCollectionValue
  for (const meta of Object.values(merged)) {
    if (meta.type?.resolvedClass) {
      sealOne(meta.type.resolvedClass, options);
    }
    if (meta.type?.resolvedCollectionValue) {
      sealOne(meta.type.resolvedCollectionValue, options);
    }
    if (meta.type?.discriminator) {
      for (const sub of meta.type.discriminator.subTypes) {
        sealOne(sub.value, options);
      }
    }
  }

  // 5. Async analysis
  const isAsync = analyzeAsync(merged, 'deserialize');
  const isSerializeAsync = analyzeAsync(merged, 'serialize');

  // 6. Generate deserialize executor code
  const deserializeExecutor = buildDeserializeCode(Class, merged, options, needsCircularCheck, isAsync);

  // 7. Generate serialize executor code
  const serializeExecutor = buildSerializeCode(Class, merged, options, isSerializeAsync);

  // 8. Replace placeholder with actual executor in-place (Object.assign preserves reference integrity)
  Object.assign(placeholder, {
    _deserialize: deserializeExecutor,
    _serialize: serializeExecutor,
    _isAsync: isAsync,
    _isSerializeAsync: isSerializeAsync,
    _merged: merged,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// mergeInheritance() — merge inheritance metadata (§4.2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Merges RAW metadata child-first along the prototype chain of Class.
 *
 * Merge rules:
 * - validation: union merge (both parent and child apply, duplicate rules removed)
 * - transform: child takes priority, inherits from parent if absent in child
 * - expose: child takes priority, inherits from parent if absent in child
 * - exclude: child takes priority, inherits from parent if absent in child
 * - type: child takes priority, inherits from parent if absent in child
 * - flags: child takes priority, only missing flags are supplemented from parent
 */
export function mergeInheritance(Class: Function): RawClassMeta {
  // Collect classes with RAW along the prototype chain (array order: child first)
  const chain: Function[] = [];
  let current: Function | null = Class;
  while (current && current !== Object) {
    if (Object.hasOwn(current as object, RAW)) chain.push(current);
    const proto = Object.getPrototypeOf(current);
    current = proto === current ? null : proto;
  }

  // child-first merge
  const merged: RawClassMeta = Object.create(null) as RawClassMeta;

  for (const ctor of chain) {
    const raw = (ctor as any)[RAW] as RawClassMeta;
    for (const [key, meta] of Object.entries(raw)) {
      if (!merged[key]) {
        // First occurrence of field → shallow copy
        merged[key] = {
          validation: [...meta.validation],
          transform: [...meta.transform],
          expose: [...meta.expose],
          exclude: meta.exclude,
          type: meta.type,
          flags: { ...meta.flags },
        };
      } else {
        // Already exists in child → independent merge per category (§4.2)
        const m = merged[key];
        const p = meta;

        // validation: union merge (remove duplicate rules)
        for (const rd of p.validation) {
          if (!m.validation.some(d => d.rule === rd.rule)) {
            m.validation.push(rd);
          }
        }

        // transform: inherit from parent if absent in child
        if (m.transform.length === 0 && p.transform.length > 0) {
          m.transform = [...p.transform];
        }

        // expose: inherit from parent if absent in child
        if (m.expose.length === 0 && p.expose.length > 0) {
          m.expose = [...p.expose];
        }

        // exclude: inherit from parent if absent in child
        if (m.exclude === null && p.exclude !== null) {
          m.exclude = p.exclude;
        }

        // type: inherit from parent if absent in child
        if (m.type === null && p.type !== null) {
          m.type = p.type;
        }

        // flags: child takes priority, only supplement missing flags from parent
        const mf = m.flags;
        const pf = p.flags;
        if (pf.isOptional !== undefined && mf.isOptional === undefined) mf.isOptional = pf.isOptional;
        if (pf.isDefined !== undefined && mf.isDefined === undefined) mf.isDefined = pf.isDefined;
        if (pf.validateIf !== undefined && mf.validateIf === undefined) mf.validateIf = pf.validateIf;
        if (pf.isNullable !== undefined && mf.isNullable === undefined) mf.isNullable = pf.isNullable;
        if (pf.validateNested !== undefined && mf.validateNested === undefined) mf.validateNested = pf.validateNested;
        if (pf.validateNestedEach !== undefined && mf.validateNestedEach === undefined) mf.validateNestedEach = pf.validateNestedEach;

      }
    }
  }

  return merged;
}

// ─────────────────────────────────────────────────────────────────────────────
// __testing__ — test-only export (TST-ACCESS compliant)
// ─────────────────────────────────────────────────────────────────────────────

export const __testing__ = {
  mergeInheritance,
  _circularPlaceholder,
};
