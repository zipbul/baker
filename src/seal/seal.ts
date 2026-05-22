import type { SealOptions } from '../interfaces';
import type { ClassCtor, RawClassMeta, RawPropertyMeta, SealedExecutors } from '../types';

import { getGlobalOptions } from '../configure';
import { SealError } from '../errors';
import { deleteSealed, freezeRaw, getRaw, getSealed, hasRawOwn, hasSealedOwn, setSealed } from '../meta-access';
import { globalRegistry } from '../registry';
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
  const flag = direction === 'deserialize' ? 'isAsync' : 'isSerializeAsync';
  const seen = visited ?? new Set<Function>();

  // sealOne seals every nested DTO (step 4) before this runs (step 5). For a fully-sealed nested
  // class its `isAsync`/`isSerializeAsync` flag is authoritative and already accounts for ITS nested
  // classes — so trusting the flag propagates async through any nesting depth (re-deriving from
  // metadata would lose `resolvedClass` past depth 1). A class still being sealed carries a
  // placeholder executor (no `merged`); that only happens on a circular back-edge, where the flag
  // is not yet known — there we recurse into the class's own metadata, guarded by `seen`.
  const nestedIsAsync = (cls: Function): boolean => {
    if (seen.has(cls)) {
      return false;
    }
    seen.add(cls);
    const sealed = getSealed(cls);
    if (sealed?.merged) {
      return sealed[flag] === true;
    }
    return analyzeAsync(mergeInheritance(cls), direction, seen);
  };

  for (const meta of Object.values(merged)) {
    // 1. createRule may return Promise<boolean> even without `async` syntax (deserialize only).
    if (direction === 'deserialize' && meta.validation.some(rd => rd.rule.isAsync)) {
      return true;
    }
    // 2. @Transform async — single-pass scan, avoids intermediate filter[] allocation
    for (const td of meta.transform) {
      if (direction === 'deserialize' ? td.options?.serializeOnly : td.options?.deserializeOnly) {
        continue;
      }
      if (td.isAsync ?? isAsyncFunction(td.fn)) {
        return true;
      }
    }
    // 3. nested DTOs (direct, Set/Map value, discriminator subtypes)
    if (nestedClassesOf(meta).some(nestedIsAsync)) {
      return true;
    }
  }
  return false;
}

/**
 * Nested DTO classes referenced by a field's type. Prefers normalized `resolved*` slots, but
 * falls back to resolving the raw `type.fn()` thunk — needed when `analyzeAsync` recurses into a
 * still-being-sealed class on a circular back-edge whose metadata was never normalized.
 */
function nestedClassesOf(meta: RawPropertyMeta): Function[] {
  const t = meta.type;
  if (!t) {
    return [];
  }
  const out: Function[] = [];
  if (t.resolvedClass) {
    out.push(t.resolvedClass);
  }
  if (t.resolvedCollectionValue) {
    out.push(t.resolvedCollectionValue);
  }
  if (t.discriminator) {
    for (const sub of t.discriminator.subTypes) {
      out.push(sub.value);
    }
  }
  if (out.length === 0 && t.fn) {
    const result = t.fn();
    if (result === Map || result === Set) {
      const cv = t.collectionValue?.();
      if (typeof cv === 'function' && !PRIMITIVE_CTORS.has(cv)) {
        out.push(cv);
      }
    } else {
      const resolved = Array.isArray(result) ? (result as unknown[])[0] : result;
      if (typeof resolved === 'function' && !PRIMITIVE_CTORS.has(resolved)) {
        out.push(resolved as Function);
      }
    }
  }
  return out;
}

// Seal state lives in ./seal-state so `configure.ts` can read it without importing this file
// (which would form a cycle: seal → configure → seal). Re-export the test helpers used by `unseal()`.

/**
 * @internal — used by serialize/deserialize. Returns the sealed executor.
 * Throws if the class was never sealed. Users must call `seal()` at app startup.
 */
function ensureSealed(Class: Function): SealedExecutors<unknown> {
  const sealed = getSealed(Class);
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
  if (isSealed()) {
    return;
  }
  const options = getGlobalOptions();
  const sealed = new Set<Function>();

  try {
    for (const Class of globalRegistry) {
      sealOne(Class, options, sealed);
    }
  } catch (e) {
    // On failure, roll back every class sealed so far (including nested DTOs) — prevent
    // partial seal state. The failed class self-cleaned its own placeholder in sealOne.
    for (const Class of sealed) {
      deleteSealed(Class);
    }
    throw e;
  }

  for (const Class of sealed) {
    sealedClasses.add(Class);
    freezeRaw(Class);
  }
  globalRegistry.clear();
  markSealed();
}

/**
 * Seal a single class (and its nested DTOs). Not part of the public API — `seal()` (argless)
 * is the only public entry. Exposed via `__testing__.sealClass` so tests can seal one class in
 * isolation. Class[Symbol.metadata][RAW] must exist; Class[SEALED] must not.
 * Transactional: on failure, every placeholder installed by this call (the class and any
 * nested DTO reached by recursion) is removed so a future seal attempt can re-run cleanly.
 */
function sealOneClass(Class: Function): void {
  if (hasSealedOwn(Class)) {
    return;
  }

  const options = getGlobalOptions();
  const sealed = new Set<Function>();
  try {
    sealOne(Class, options, sealed);
  } catch (e) {
    // Roll back every class sealed during this call (the failed class self-cleaned in sealOne).
    for (const C of sealed) {
      deleteSealed(C);
    }
    throw e;
  }

  // Freeze + track + drop from the registry every class sealed by this call (incl. nested).
  for (const C of sealed) {
    sealedClasses.add(C);
    freezeRaw(C);
    globalRegistry.delete(C);
  }
}

/**
 * Public — call once at app startup. Seals every @Recipe-decorated class (and its nested DTOs)
 * and clears the registry. Idempotent: a second call is a no-op.
 *
 * Baker requires this call before any deserialize/serialize/validate. There is no implicit seal.
 * All DTOs must be imported before this call — baker has no lazy/on-demand sealing.
 */
function seal(): void {
  sealAllRegistered();
}

// ─────────────────────────────────────────────────────────────────────────────
// sealOne() — seal an individual class (§4.1)
// ─────────────────────────────────────────────────────────────────────────────

function sealOne(Class: Function, options?: SealOptions, sealedAcc?: Set<Function>): void {
  if (hasSealedOwn(Class)) {
    return;
  } // already sealed (prevent recursion during circular references)

  // 0. Register placeholder — prevent infinite recursion on circular references
  const placeholder = circularPlaceholder(Class.name);
  setSealed(Class, placeholder);

  try {
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
      if (!meta.type?.fn) {
        continue;
      }
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
            typeCopy.resolvedCollectionValue = valCls as ClassCtor;
          }
        }
        merged[key] = { ...meta, type: typeCopy };
        continue;
      }

      const isArray = Array.isArray(typeResult);
      const resolved = isArray ? (typeResult as unknown[])[0] : typeResult;
      if (resolved == null || typeof resolved !== 'function') {
        throw new SealError(
          `${Class.name}: @Type/@Field type must return a constructor or [constructor], got ${String(resolved)}`,
        );
      }
      // Copy type object before mutating — preserve original RAW type reference
      const typeCopy = { ...meta.type, isArray };
      if (!PRIMITIVE_CTORS.has(resolved)) {
        typeCopy.resolvedClass = resolved as ClassCtor;
        // Automatically set validateNested flags for DTO classes
        if (!meta.flags.validateNested || !meta.flags.validateNestedEach) {
          meta.flags = { ...meta.flags };
          if (!meta.flags.validateNested) {
            meta.flags.validateNested = true;
          }
          if (isArray && !meta.flags.validateNestedEach) {
            meta.flags.validateNestedEach = true;
          }
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
        sealOne(meta.type.resolvedClass, options, sealedAcc);
      }
      if (meta.type?.resolvedCollectionValue) {
        sealOne(meta.type.resolvedCollectionValue, options, sealedAcc);
      }
      if (meta.type?.discriminator) {
        for (const sub of meta.type.discriminator.subTypes) {
          sealOne(sub.value, options, sealedAcc);
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
  } catch (e) {
    // Self-clean this class's placeholder so a failed seal leaves no broken state —
    // including nested DTOs reached by recursion that are not in the registry.
    deleteSealed(Class);
    throw e;
  }

  // Record success so the caller can freeze + track every sealed class (including nested
  // DTOs reached by recursion) once the whole operation succeeds. Freezing here would be
  // premature: a later failure must roll back, and a frozen RAW cannot be re-sealed.
  sealedAcc?.add(Class);
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
    if (hasRawOwn(current)) {
      chain.push(current);
    }
    const proto = Object.getPrototypeOf(current);
    current = proto === current ? null : proto;
  }

  // child-first merge
  const merged: RawClassMeta = Object.create(null) as RawClassMeta;
  // When the prototype chain has only the class itself (no decorated parent), no merging happens
  // and we never mutate the metadata arrays — skip the shallow copy entirely.
  const needsCopy = chain.length > 1;

  for (const ctor of chain) {
    const raw = getRaw(ctor)!;
    for (const [key, meta] of Object.entries(raw)) {
      if (!merged[key]) {
        // First occurrence of field → copy only when subsequent ancestors might mutate
        merged[key] = needsCopy
          ? {
              validation: [...meta.validation],
              transform: [...meta.transform],
              expose: [...meta.expose],
              exclude: meta.exclude,
              type: meta.type,
              flags: { ...meta.flags },
            }
          : meta;
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
        if (pf.isOptional !== undefined && mf.isOptional === undefined) {
          mf.isOptional = pf.isOptional;
        }
        if (pf.isDefined !== undefined && mf.isDefined === undefined) {
          mf.isDefined = pf.isDefined;
        }
        if (pf.validateIf !== undefined && mf.validateIf === undefined) {
          mf.validateIf = pf.validateIf;
        }
        if (pf.isNullable !== undefined && mf.isNullable === undefined) {
          mf.isNullable = pf.isNullable;
        }
        if (pf.validateNested !== undefined && mf.validateNested === undefined) {
          mf.validateNested = pf.validateNested;
        }
        if (pf.validateNestedEach !== undefined && mf.validateNestedEach === undefined) {
          mf.validateNestedEach = pf.validateNestedEach;
        }
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
  // Targeted single-class seal — test-only. Production code uses argless seal() exclusively;
  // this exists so tests can seal one class in isolation (e.g. error-path assertions).
  sealClass: sealOneClass,
};

export { ensureSealed, seal, mergeInheritance, __testing__ };
export { sealedClasses, resetForTesting } from './seal-state';
