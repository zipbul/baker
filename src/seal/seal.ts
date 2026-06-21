import type { SealOptions, SealedExecutors } from './interfaces';
import type { ClassCtor } from '../common';
import type { MetaStore } from '../metadata';

import { CollectionType, metaStore } from '../metadata';
import { Direction, BakerError } from '../common';
import { AsyncAnalyzer } from './async-analyzer';
import { CircularAnalyzer } from './circular-analyzer';
import { CircularPlaceholder } from './circular-placeholder';
import { CompileCache, compileCache } from './compile-cache';
import { PRIMITIVE_CTORS, RESERVED_PROPERTY_NAMES } from './constants';
import { buildDeserializeCode, buildValidateCode } from './deserialize-builder';
import { validateExposeStacks } from './expose-validator';
import { InheritanceMerger } from './inheritance-merger';
import { MetaValidator } from './meta-validator';
import { buildSerializeCode } from './serialize-builder';

/**
 * One seal operation. Holds the per-operation state — the calling Baker's executor map, the resolved
 * options, the config fingerprint, and the set of classes compiled by this run — as fields, so the
 * recursive nested-DTO sealing reads from a single source of truth instead of threading them through
 * every call. Created fresh per `new Baker().seal()` (via {@link sealRegistry}).
 *
 * Executors are written into the Baker's own map, never onto the class, so two bakers sealing the same
 * class each compile their own executor with their own options — apps never mix. Within one run an
 * already-present class is reused as-is (circular-ref guard + shared nested DTO dedup for that baker).
 */
class SealRun {
  private readonly fp: string;
  /** Classes compiled by THIS run (excludes cache hits) → their executor, committed to the cache on success. */
  private readonly sealed = new Map<Function, SealedExecutors<unknown>>();
  /** Every class THIS run inserted into `executors` (fresh placeholders + cache reuses) — for precise rollback. */
  private readonly inserted = new Set<Function>();
  private readonly resolve = (cls: Function): SealedExecutors<unknown> | undefined => this.executors.get(cls);
  readonly #merger: InheritanceMerger;
  readonly #circular: CircularAnalyzer;
  readonly #async: AsyncAnalyzer;
  readonly #validator: MetaValidator;

  constructor(
    private readonly executors: Map<Function, SealedExecutors<unknown>>,
    private readonly options: SealOptions,
    meta: MetaStore = metaStore,
  ) {
    this.fp = CompileCache.fingerprint(options);
    // Composition root for one seal run: the analyzers/merger/validator are constructed here in the
    // constructor body (after parameter properties + the `resolve` field initializer exist) so each
    // collaborator receives its dependency. Order matters — merger before its dependents.
    this.#merger = new InheritanceMerger(meta);
    this.#circular = new CircularAnalyzer(this.#merger);
    this.#async = new AsyncAnalyzer(this.resolve, this.#merger);
    this.#validator = new MetaValidator(meta);
  }

  /**
   * Seal every class in `registry`. Transactional: on any failure every class sealed by this run is
   * rolled back. Clears `registry` on success.
   */
  run(registry: Set<Function>): void {
    try {
      for (const Class of registry) {
        this.sealOne(Class);
      }
    } catch (e) {
      // Roll back exactly what this run inserted (fresh placeholders + cache reuses), leaving any
      // pre-existing executor untouched — a self-contained transaction that does not assume the map
      // was empty at entry.
      for (const Class of this.inserted) {
        this.executors.delete(Class);
      }
      throw e;
    }

    // Commit only the classes compiled by THIS run to the shared cache (cache hits are already there).
    for (const [Class, executor] of this.sealed) {
      compileCache.set(Class, this.fp, executor);
    }
    registry.clear();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // sealOne() — seal an individual class
  // ───────────────────────────────────────────────────────────────────────────

  private sealOne(Class: Function): void {
    if (this.executors.has(Class)) {
      // Already in THIS baker's map (placeholder mid-seal, freshly compiled, or cache-reused). Prevents
      // infinite recursion on circular references and dedups a shared nested DTO within this seal.
      return;
    }

    // Cache hit: another baker already compiled this class under the SAME config — reuse its executor.
    const cached = compileCache.get(Class, this.fp);
    if (cached !== undefined) {
      this.executors.set(Class, cached);
      this.inserted.add(Class);
      // Seed this baker's map with the transitive nested classes too, so resolving a nested-only DTO as
      // a TOP-LEVEL argument (app.deserialize(Nested, …)) behaves identically whether this baker compiled
      // fresh or hit the cache. Each nested is itself a cache hit (it was committed when the root was
      // first sealed); the executors.has guard above terminates circular graphs.
      if (cached.merged) {
        for (const meta of Object.values(cached.merged)) {
          for (const nested of this.#async.nestedClassesOf(meta)) {
            this.sealOne(nested);
          }
        }
      }
      return;
    }

    // 0. Register placeholder — prevent infinite recursion on circular references
    const placeholder = new CircularPlaceholder(Class.name);
    this.executors.set(Class, placeholder);
    this.inserted.add(Class);

    try {
      // 1. Merge inheritance metadata
      const merged = this.#merger.merge(Class);

      // 1a. Banned field name check — prevent prototype pollution (C5)
      for (const key of Object.keys(merged)) {
        if (RESERVED_PROPERTY_NAMES.has(key)) {
          throw new BakerError(`${Class.name}: field name '${key}' is not allowed (reserved property name)`);
        }
      }

      // 1b. TypeDef normalization — resolve @Type/@Field type fn(), detect arrays, auto-infer nested DTOs
      //     Prevent original RAW mutation: copy the shared RAW `type` before mutating (C-16 root fix).
      //     `flags` is already cloned per-seal by mergeInheritance, so it is mutated in place below.
      for (const [key, meta] of Object.entries(merged)) {
        if (!meta.type?.fn) {
          continue;
        }
        let typeResult: unknown;
        try {
          typeResult = meta.type.fn();
        } catch (e) {
          throw new BakerError(`${Class.name}.${key}: type function threw: ${e instanceof Error ? e.message : String(e)}`, {
            cause: e,
          });
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
              throw new BakerError(`${Class.name}.${key}: collectionValue function threw: ${e instanceof Error ? e.message : String(e)}`, {
                cause: e,
              });
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
          // Automatically set validateNested flags for DTO classes. `meta.flags` is already a per-seal
          // copy (mergeInheritance clones it), so mutate it directly — no second copy-on-write here.
          if (!meta.flags.validateNested) {
            meta.flags.validateNested = true;
          }
          if (isArray && !meta.flags.validateNestedEach) {
            meta.flags.validateNestedEach = true;
          }
        }
        merged[key] = { ...meta, type: typeCopy };
      }

      // 2. Static validation of @Expose stacks (throws BakerError on failure)
      validateExposeStacks(merged, Class.name);

      // 2b. W2: seal-time invariant checks (D7 discriminator/Set·Map + D9 async-in-sync)
      this.#validator.validateShape(Class, merged);

      // 3. Static analysis for circular references
      const needsCircularCheck = this.#circular.analyze(Class);

      // 4. Seal nested @Type referenced DTOs first (recursive). `nestedClassesOf` is the single source
      //    of truth for "which classes does a field reference" — the same helper analyzeAsync uses in
      //    step 5, so the two traversals cannot drift (e.g. a new reference kind added in one only).
      for (const meta of Object.values(merged)) {
        for (const nested of this.#async.nestedClassesOf(meta)) {
          this.sealOne(nested);
        }
      }

      // 5. Async analysis
      const isAsync = this.#async.analyze(merged, Direction.Deserialize);
      const isSerializeAsync = this.#async.analyze(merged, Direction.Serialize);

      // 6. Generate deserialize executor code
      const deserializeExecutor = buildDeserializeCode(Class, merged, this.options, needsCircularCheck, isAsync, this.resolve);

      // 6b. Generate validate-only executor code (no Object.create, no assignments)
      const validateExecutor = buildValidateCode(Class, merged, this.options, needsCircularCheck, isAsync, this.resolve);

      // 7. Generate serialize executor code
      const serializeExecutor = buildSerializeCode(Class, merged, this.options, isSerializeAsync, this.resolve);

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
      this.executors.delete(Class);
      throw e;
    }

    // Record success (class → its now-filled executor) so the run can commit every sealed class
    // (including nested DTOs reached by recursion) once the whole operation succeeds. Committing here
    // would be premature: a later failure must roll back.
    this.sealed.set(Class, placeholder);
  }
}

/**
 * Seal every class in `registry` with `options`, writing executors into `executors`. The core used by
 * `new Baker().seal()` — a thin entry point over one {@link SealRun}.
 */
function sealRegistry(
  registry: Set<Function>,
  options: SealOptions,
  executors: Map<Function, SealedExecutors<unknown>>,
): void {
  new SealRun(executors, options).run(registry);
}

export { sealRegistry };
