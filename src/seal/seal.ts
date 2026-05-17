import type { SealOptions } from '../interfaces';
import type { RawClassMeta, SealedExecutors } from '../types';

import { getGlobalOptions } from '../configure';
import { SealError } from '../errors';
import { globalRegistry } from '../registry';
import { RAW, SEALED } from '../symbols';
import { isAsyncFunction } from '../utils';
import { analyzeCircular } from './circular-analyzer';
import { buildDeserializeCode, buildValidateCode } from './deserialize-builder';
import { validateExposeStacks } from './expose-validator';
import { sealedClasses, isSealed, markSealed } from './seal-state';
import { buildSerializeCode } from './serialize-builder';
import { validateMeta } from './validate-meta';

const BANNED_FIELD_NAMES = new Set(['__proto__', 'constructor', 'prototype']);
const PRIMITIVE_CTORS = new Set<Function>([Number, String, Boolean, Date]);

/** @internal Placeholder executor for circular dependency detection during seal */
function circularPlaceholder(className: string): SealedExecutors<unknown> {
  const msg = `Circular dependency during seal: ${className} is still being sealed`;
  return {
    deserialize() {
      throw new SealError(msg);
    },
    serialize() {
      throw new SealError(msg);
    },
    validate() {
      throw new SealError(msg);
    },
    isAsync: false,
    isSerializeAsync: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// analyzeAsync — static analysis to determine if a sealed DTO requires an async executor (C1)
// ─────────────────────────────────────────────────────────────────────────────

function analyzeAsync(merged: RawClassMeta, direction: 'deserialize' | 'serialize', visited?: Set<Function>): boolean {
  const v = visited ?? new Set<Function>();
  for (const meta of Object.values(merged)) {
    // 1. createRule may return Promise<boolean> even without `async` syntax.
    if (direction === 'deserialize' && meta.validation.some(rd => rd.rule.isAsync)) {return true;}
    // 2. @Transform async
    const transforms =
      direction === 'deserialize'
        ? meta.transform.filter(td => !td.options?.serializeOnly)
        : meta.transform.filter(td => !td.options?.deserializeOnly);
    if (transforms.some(td => td.isAsync ?? isAsyncFunction(td.fn))) {return true;}
    // 3. nested DTO async — use resolvedClass (post-normalization), fallback to fn() if not normalized
    if (meta.type?.resolvedClass) {
      const nestedClass = meta.type.resolvedClass;
      if (!v.has(nestedClass)) {
        v.add(nestedClass);
        const nestedMerged = mergeInheritance(nestedClass);
        if (analyzeAsync(nestedMerged, direction, v)) {return true;}
      }
    }
    // discriminator subTypes
    if (meta.type?.discriminator) {
      for (const sub of meta.type.discriminator.subTypes) {
        if (!v.has(sub.value)) {
          v.add(sub.value);
          const subMerged = mergeInheritance(sub.value);
          if (analyzeAsync(subMerged, direction, v)) {return true;}
        }
      }
    }
    // Set/Map nested DTO (collectionValue) — propagate async from value DTO to parent
    if (meta.type?.resolvedCollectionValue) {
      const valueClass = meta.type.resolvedCollectionValue;
      if (!v.has(valueClass)) {
        v.add(valueClass);
        const valueMerged = mergeInheritance(valueClass);
        if (analyzeAsync(valueMerged, direction, v)) {return true;}
      }
    }
  }
  return false;
}

// Seal state lives in ./seal-state so `configure.ts` can read it without importing this file
// (which would form a cycle: seal → configure → seal). Re-export the test helpers used by `unseal()`.

/**
 * @internal — used by serialize/deserialize. Returns the sealed executor.
 * Throws if the class was never sealed. Users must call `seal()` at app startup.
 */
function ensureSealed(Class: Function): SealedExecutors<unknown> {
  const sealed = (Class as any)[SEALED] as SealedExecutors<unknown> | undefined;
  if (!sealed) {
    const name = Class.name || '<anonymous class>';
    throw new SealError(
      `${name} is not sealed. Call seal() at app startup before deserialize/validate/serialize. ` +
        `(If ${name} has no @Field decorators, decorate at least one property.)`,
    );
  }
  return sealed;
}

/**
 * Seal every class in the decorator registry, then clear the registry.
 */
function sealAllRegistered(): void {
  if (isSealed()) {return;}
  const options = getGlobalOptions();

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
    sealedClasses.add(Class);
    Object.freeze((Class as any)[RAW]);
  }
  globalRegistry.clear();
  markSealed();
}

/**
 * Seal a single late-registered class (e.g. dynamic import after the main `seal()`).
 * Class[RAW] must exist; Class[SEALED] must not.
 * Transactional: on failure, any placeholder installed by sealOne is removed so a future
 * seal(Class) call can re-attempt cleanly.
 */
function sealOneClass(Class: Function): void {
  if (Object.hasOwn(Class as object, SEALED)) {return;}
  if (!Object.hasOwn(Class as object, RAW)) {
    throw new SealError(
      `${Class.name}: cannot seal a class that has no @Field decorators. ` +
        `seal(${Class.name}) is a no-op unless ${Class.name} has at least one @Field.`,
    );
  }

  const before = new Set(sealedClasses);
  const beforeSealed = new Set<Function>([...globalRegistry].filter(C => Object.hasOwn(C as object, SEALED)));
  const options = getGlobalOptions();
  try {
    sealOne(Class, options);
  } catch (e) {
    // Remove placeholder SEALED markers left on this class and any nested class touched during the failed seal
    if (Object.hasOwn(Class as object, SEALED) && !beforeSealed.has(Class)) {
      delete (Class as any)[SEALED];
    }
    for (const C of globalRegistry) {
      if (Object.hasOwn(C as object, SEALED) && !beforeSealed.has(C)) {
        delete (C as any)[SEALED];
      }
    }
    throw e;
  }

  sealedClasses.add(Class);
  Object.freeze((Class as any)[RAW]);
  globalRegistry.delete(Class);

  // Nested DTOs sealed recursively by sealOne — freeze + drop from registry too
  const newlySealed = [...globalRegistry].filter(C => Object.hasOwn(C as object, SEALED) && !before.has(C));
  for (const C of newlySealed) {
    sealedClasses.add(C);
    Object.freeze((C as any)[RAW]);
    globalRegistry.delete(C);
  }
}

/**
 * Public — explicit seal at app startup. With no args, seals every class currently in the
 * decorator registry. With args, seals each given class (and its nested DTOs) on demand.
 * Idempotent: already-sealed classes are skipped.
 *
 * Baker requires this call before any deserialize/serialize/validate. There is no implicit seal.
 */
function seal(...classes: Function[]): void {
  if (classes.length === 0) {
    sealAllRegistered();
    return;
  }
  for (const Class of classes) {
    sealOneClass(Class);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// sealOne() — seal an individual class (§4.1)
// ─────────────────────────────────────────────────────────────────────────────

function sealOne(Class: Function, options?: SealOptions): void {
  if (Object.hasOwn(Class as object, SEALED)) {return;} // already sealed (prevent recursion during circular references)

  // 0. Register placeholder — prevent infinite recursion on circular references
  const placeholder = circularPlaceholder(Class.name);
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
    if (!meta.type?.fn) {continue;}
    const typeResult = meta.type.fn();

    // Detect Map/Set collection
    if (typeResult === Map || typeResult === Set) {
      const collection = typeResult === Map ? ('Map' as const) : ('Set' as const);
      const typeCopy = { ...meta.type, collection, isArray: false };
      // collectionValue thunk → cache resolvedCollectionValue
      if (meta.type.collectionValue) {
        let valCls: unknown;
        try {
          valCls = meta.type.collectionValue();
        } catch (e) {
          throw new SealError(`${Class.name}.${key}: collectionValue function threw: ${(e as Error).message}`);
        }
        if (valCls != null && typeof valCls === 'function' && !PRIMITIVE_CTORS.has(valCls as Function)) {
          typeCopy.resolvedCollectionValue = valCls as new (...args: any[]) => any;
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
        if (!meta.flags.validateNested) {meta.flags.validateNested = true;}
        if (isArray && !meta.flags.validateNestedEach) {meta.flags.validateNestedEach = true;}
      }
    }
    merged[key] = { ...meta, type: typeCopy };
  }

  // 2. Static validation of @Expose stacks (throws SealError on failure)
  validateExposeStacks(merged, Class.name);

  // 2b. W2: seal-time invariant checks (D7 discriminator/Set·Map + D9 async-in-sync)
  validateMeta(Class, merged);

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

  // 6b. Generate validate-only executor code (no Object.create, no assignments)
  const validateExecutor = buildValidateCode(Class, merged, options, needsCircularCheck, isAsync);

  // 7. Generate serialize executor code
  const serializeExecutor = buildSerializeCode(Class, merged, options, isSerializeAsync);

  // 8. Replace placeholder with actual executor in-place (Object.assign preserves reference integrity)
  Object.assign(placeholder, {
    deserialize: deserializeExecutor,
    serialize: serializeExecutor,
    validate: validateExecutor,
    isAsync: isAsync,
    isSerializeAsync: isSerializeAsync,
    merged: merged,
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
function mergeInheritance(Class: Function): RawClassMeta {
  // Collect classes with RAW along the prototype chain (array order: child first)
  const chain: Function[] = [];
  let current: Function | null = Class;
  while (current && current !== Object) {
    if (Object.hasOwn(current as object, RAW)) {chain.push(current);}
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

        // validation: union merge by ruleName — child overrides parent for the same rule name (N-6)
        for (const rd of p.validation) {
          if (!m.validation.some(d => d.rule.ruleName === rd.rule.ruleName)) {
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
        if (pf.isOptional !== undefined && mf.isOptional === undefined) {mf.isOptional = pf.isOptional;}
        if (pf.isDefined !== undefined && mf.isDefined === undefined) {mf.isDefined = pf.isDefined;}
        if (pf.validateIf !== undefined && mf.validateIf === undefined) {mf.validateIf = pf.validateIf;}
        if (pf.isNullable !== undefined && mf.isNullable === undefined) {mf.isNullable = pf.isNullable;}
        if (pf.validateNested !== undefined && mf.validateNested === undefined) {mf.validateNested = pf.validateNested;}
        if (pf.validateNestedEach !== undefined && mf.validateNestedEach === undefined)
          {mf.validateNestedEach = pf.validateNestedEach;}
      }
    }
  }

  return merged;
}

// ─────────────────────────────────────────────────────────────────────────────
// __testing__ — test-only export (TST-ACCESS compliant)
// ─────────────────────────────────────────────────────────────────────────────

const __testing__ = {
  mergeInheritance,
  circularPlaceholder,
};

export { ensureSealed, seal, mergeInheritance, __testing__ };
export { sealedClasses, resetForTesting } from './seal-state';
