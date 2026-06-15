import type { SealOptions } from '../interfaces';
import type { ClassCtor, RawClassMeta, RawPropertyMeta, SealedExecutors } from '../types';

import { CollectionType, Direction } from '../enums';
import { BakerError } from '../errors';
import { getRaw, hasRawOwn } from '../meta-access';
import { isAsyncFunction } from '../utils';
import { analyzeCircular } from './circular-analyzer';
import { buildDeserializeCode, buildValidateCode } from './deserialize-builder';
import { validateExposeStacks } from './expose-validator';
import { buildSerializeCode } from './serialize-builder';
import { validateMeta } from './validate-meta';

const BANNED_FIELD_NAMES = new Set(['__proto__', 'constructor', 'prototype']);
const PRIMITIVE_CTORS = new Set<Function>([Number, String, Boolean, Date]);

/** @internal Placeholder executor for circular dependency detection during seal */
function circularPlaceholder(className: string): SealedExecutors<unknown> {
  const msg = `Circular dependency during seal: ${className} is still being sealed`;
  return {
    deserialize() {
      throw new BakerError(msg);
    },
    serialize() {
      throw new BakerError(msg);
    },
    validate() {
      throw new BakerError(msg);
    },
    isAsync: false,
    isSerializeAsync: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// analyzeAsync — static analysis to determine if a sealed DTO requires an async executor (C1)
// ─────────────────────────────────────────────────────────────────────────────

function analyzeAsync(
  merged: RawClassMeta,
  direction: Direction,
  resolve: (cls: Function) => SealedExecutors<unknown> | undefined,
  visited?: Set<Function>,
): boolean {
  const flag = direction === Direction.Deserialize ? 'isAsync' : 'isSerializeAsync';
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
    const sealed = resolve(cls);
    if (sealed?.merged) {
      return sealed[flag] === true;
    }
    return analyzeAsync(mergeInheritance(cls), direction, resolve, seen);
  };

  for (const meta of Object.values(merged)) {
    // 1. createRule may return Promise<boolean> even without `async` syntax (deserialize only).
    if (direction === Direction.Deserialize && meta.validation.some(rd => rd.rule.isAsync)) {
      return true;
    }
    // 2. @Transform async — single-pass scan, avoids intermediate filter[] allocation
    for (const td of meta.transform) {
      if (direction === Direction.Deserialize ? td.options?.serializeOnly : td.options?.deserializeOnly) {
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

/**
 * Seal every class in `registry` with `options`. The core used by `new Baker().seal()`.
 * Transactional: on any failure every class sealed by this call is rolled back. Clears `registry`
 * on success.
 *
 * Executors are written into `executors` (the calling Baker's own map), never onto the class, so two
 * bakers sealing the same class each compile their own executor with their own options — apps never
 * mix. Within one baker's seal, an already-present class is reused as-is (circular-ref guard + shared
 * nested DTO dedup for that baker).
 */
// ─────────────────────────────────────────────────────────────────────────────
// (class, config) executor cache — content-addressed sharing across bakers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A class's generated executor is a pure function of (its RAW metadata, the seal config). So two
 * bakers with the SAME config compile byte-identical executors — memoize globally by
 * `(class, configFingerprint)` so they share one executor (compiled once) instead of N copies, while
 * different-config bakers stay isolated (distinct fingerprint → distinct entry). Behaviour is
 * unchanged either way: executors are pure (no per-call mutable state), so sharing is invisible.
 *
 * `WeakMap<class>` so an entry is reclaimed when its class is GC'd. The inner `Map` retains one
 * executor per (class, config) for the class's lifetime — bounded for a fixed DTO/config set (the
 * intended "seal once at startup" usage); a program that dynamically generates classes/configs would
 * grow it without eviction.
 */
const compileCache = new WeakMap<Function, Map<string, SealedExecutors<unknown>>>();

/** Canonical fingerprint of a SealOptions — the 5 booleans in fixed order. `{}` and a fully-defaulted
 * object both map to "00000", so `new Baker()` and `new Baker({})` share a cache key. */
function configFingerprint(o: SealOptions): string {
  return (
    (o.enableImplicitConversion ? '1' : '0') +
    (o.exposeDefaultValues ? '1' : '0') +
    (o.stopAtFirstError ? '1' : '0') +
    (o.whitelist ? '1' : '0') +
    (o.debug ? '1' : '0')
  );
}

function getCached(cls: Function, fp: string): SealedExecutors<unknown> | undefined {
  return compileCache.get(cls)?.get(fp);
}

function setCached(cls: Function, fp: string, exec: SealedExecutors<unknown>): void {
  let m = compileCache.get(cls);
  if (m === undefined) {
    m = new Map();
    compileCache.set(cls, m);
  }
  m.set(fp, exec);
}

function sealRegistry(
  registry: Set<Function>,
  options: SealOptions,
  executors: Map<Function, SealedExecutors<unknown>>,
): void {
  const fp = configFingerprint(options);
  const sealed = new Set<Function>();
  try {
    for (const Class of registry) {
      sealOne(Class, executors, fp, options, sealed);
    }
  } catch (e) {
    // Roll back the whole map — seal is one-shot, so `executors` was empty at entry; clearing it
    // removes both freshly-compiled placeholders and any cache-reused entries from this attempt.
    executors.clear();
    throw e;
  }

  // Commit only the classes compiled by THIS seal to the shared cache (cache hits are already there).
  for (const Class of sealed) {
    setCached(Class, fp, executors.get(Class)!);
  }
  registry.clear();
}

// ─────────────────────────────────────────────────────────────────────────────
// sealOne() — seal an individual class (§4.1)
// ─────────────────────────────────────────────────────────────────────────────

function sealOne(
  Class: Function,
  executors: Map<Function, SealedExecutors<unknown>>,
  fp: string,
  options?: SealOptions,
  sealedAcc?: Set<Function>,
): void {
  if (executors.has(Class)) {
    // Already in THIS baker's map (placeholder mid-seal, freshly compiled, or cache-reused). Prevents
    // infinite recursion on circular references and dedups a shared nested DTO within this seal.
    return;
  }

  // Cache hit: another baker already compiled this class under the SAME config — reuse its executor.
  const cached = getCached(Class, fp);
  if (cached !== undefined) {
    executors.set(Class, cached);
    return;
  }

  // 0. Register placeholder — prevent infinite recursion on circular references
  const placeholder = circularPlaceholder(Class.name);
  executors.set(Class, placeholder);

  const resolve = (cls: Function): SealedExecutors<unknown> | undefined => executors.get(cls);

  try {
    // 1. Merge inheritance metadata
    const merged = mergeInheritance(Class);

    // 1a. Banned field name check — prevent prototype pollution (C5)
    for (const key of Object.keys(merged)) {
      if (BANNED_FIELD_NAMES.has(key)) {
        throw new BakerError(`${Class.name}: field name '${key}' is not allowed (reserved property name)`);
      }
    }

    // 1b. TypeDef normalization — resolve @Type/@Field type fn(), detect arrays, auto-infer nested DTOs
    //     Prevent original RAW mutation: copy type/flags before mutating (C-16 root fix)
    for (const [key, meta] of Object.entries(merged)) {
      if (!meta.type?.fn) {
        continue;
      }
      let typeResult: unknown;
      try {
        typeResult = meta.type.fn();
      } catch (e) {
        throw new BakerError(`${Class.name}.${key}: type function threw: ${(e as Error).message}`, { cause: e });
      }

      // Detect Map/Set collection
      if (typeResult === Map || typeResult === Set) {
        const collection = typeResult === Map ? CollectionType.Map : CollectionType.Set;
        const typeCopy = { ...meta.type, collection, isArray: false };
        // collectionValue thunk → cache resolvedCollectionValue
        if (meta.type.collectionValue) {
          let valCls: unknown;
          try {
            valCls = meta.type.collectionValue();
          } catch (e) {
            throw new BakerError(`${Class.name}.${key}: collectionValue function threw: ${(e as Error).message}`, { cause: e });
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
        throw new BakerError(
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

    // 2. Static validation of @Expose stacks (throws BakerError on failure)
    validateExposeStacks(merged, Class.name);

    // 2b. W2: seal-time invariant checks (D7 discriminator/Set·Map + D9 async-in-sync)
    validateMeta(Class, merged);

    // 3. Static analysis for circular references
    const needsCircularCheck = analyzeCircular(Class);

    // 4. Seal nested @Type referenced DTOs first (recursive) — uses resolvedClass / resolvedCollectionValue
    for (const meta of Object.values(merged)) {
      if (meta.type?.resolvedClass) {
        sealOne(meta.type.resolvedClass, executors, fp, options, sealedAcc);
      }
      if (meta.type?.resolvedCollectionValue) {
        sealOne(meta.type.resolvedCollectionValue, executors, fp, options, sealedAcc);
      }
      if (meta.type?.discriminator) {
        for (const sub of meta.type.discriminator.subTypes) {
          sealOne(sub.value, executors, fp, options, sealedAcc);
        }
      }
    }

    // 5. Async analysis
    const isAsync = analyzeAsync(merged, Direction.Deserialize, resolve);
    const isSerializeAsync = analyzeAsync(merged, Direction.Serialize, resolve);

    // 6. Generate deserialize executor code
    const deserializeExecutor = buildDeserializeCode(Class, merged, options, needsCircularCheck, isAsync, resolve);

    // 6b. Generate validate-only executor code (no Object.create, no assignments)
    const validateExecutor = buildValidateCode(Class, merged, options, needsCircularCheck, isAsync, resolve);

    // 7. Generate serialize executor code
    const serializeExecutor = buildSerializeCode(Class, merged, options, isSerializeAsync, resolve);

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
    executors.delete(Class);
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

  for (const ctor of chain) {
    const raw = getRaw(ctor)!;
    for (const [key, meta] of Object.entries(raw)) {
      if (!merged[key]) {
        // Always copy each meta (incl. a fresh `flags` object and fresh arrays). RAW is shared
        // across bakers and re-sealed per baker; normalization in sealOne mutates `meta.flags`,
        // so it must operate on a copy and never touch the pristine RAW.
        merged[key] = {
          ...meta,
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

export { sealRegistry, mergeInheritance, circularPlaceholder, getCached, configFingerprint };
