import type { SealOptions } from './interfaces';
import type { ClassCtor } from '../common';
import type { SealedExecutors } from './types';

import { CollectionType } from '../metadata';
import { Direction, BakerError } from '../common';
import { analyzeAsync, nestedClassesOf } from './async-analysis';
import { analyzeCircular } from './circular-analyzer';
import { circularPlaceholder } from './circular-placeholder';
import { configFingerprint, getCached, setCached } from './compile-cache';
import { PRIMITIVE_CTORS } from './constants';
import { buildDeserializeCode, buildValidateCode } from './deserialize-builder';
import { validateExposeStacks } from './expose-validator';
import { mergeInheritance } from './merge-inheritance';
import { buildSerializeCode } from './serialize-builder';
import { validateMeta } from './validate-meta';

const BANNED_FIELD_NAMES = new Set(['__proto__', 'constructor', 'prototype']);

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
    // Seed this baker's map with the transitive nested classes too, so resolving a nested-only DTO as
    // a TOP-LEVEL argument (app.deserialize(Nested, …)) behaves identically whether this baker compiled
    // fresh or hit the cache. Each nested is itself a cache hit (it was committed when the root was
    // first sealed); the executors.has guard above terminates circular graphs.
    if (cached.merged) {
      for (const meta of Object.values(cached.merged)) {
        for (const nested of nestedClassesOf(meta)) {
          sealOne(nested, executors, fp, options, sealedAcc);
        }
      }
    }
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

export { sealRegistry };
