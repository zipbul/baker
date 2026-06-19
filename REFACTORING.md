# @zipbul/baker — Refactoring Plan (structure-first, domain-owned)

Goal: a layered directory structure where **each domain owns its own types, enums, and implementation**,
and higher layers reference lower ones — never the reverse. Decide the skeleton top-down, then move
symbols into the domain that owns them, then split the oversized files. Behavior-preserving; `tsc` clean
and the full suite green at every step; generated `new Function` bodies **byte-identical** (the 5.1
`(class,config)` cache shares one sealed form across same-config bakers, so codegen drift would be
silently cross-baker-visible).

Conventions: per-directory `enums.ts`/`types.ts`/`constants.ts`/`interfaces.ts`; directory barrels
(`index.ts`); strict named exports (no `export *`); `import type`/`export type` for type-only
(`verbatimModuleSyntax`); move code verbatim (never "tidy" documented micro-opts during extraction).

---

## Classification — layered pipeline, domain-owned (triple-reviewed)

baker is a compiler: **author metadata → seal/compile → run**. Its axis of change is the pipeline
stage (add a rule → `rules/`; change codegen → `seal/`; change runtime → `runtime/`). A vertical/feature
slice is wrong — it would shatter the single generic `deserialize-builder` compiler and the single
generated runtime executor. So the cut is by pipeline layer.

**Placement rule (the one that was gotten wrong before):** *each symbol lives in the domain that owns
it — the LOWEST layer that consumes it — and higher layers import it downward.* A domain owns its
TYPES and its IMPLEMENTATION together (e.g. `transformers/` owns the `Transformer` type AND the
`trimTransformer`/`jsonTransformer` impls; `rules/` owns `InternalRule`/`RequiredType` AND `isString`).
There is **no bottom "core kernel"** holding other domains' types — that inverts the arrows. The only
bottom leaves are the truly-global primitives (`symbols`, `errors`, `utils`).

**The RAW metadata IR is a layer, not a leaf.** `Raw*Meta` + the `*Def` family *aggregate* the author
domains' types (`RuleDef.rule: InternalRule`, `TransformDef.fn: TransformFunction`), so the IR sits
ABOVE `rules/`/`transformers/` and imports them downward — it is NOT a leaf below them.

---

## Target skeleton (bottom → top; every import points downward)

```
src/
├── symbols.ts      # LEAF · ROOT — Symbol.metadata polyfill (load-order) + published ./symbols. DO NOT MOVE.
├── errors/         # LEAF — BakerError, BakerIssue(Set), guards, toBakerIssueSet, BAKER_ERROR
├── utils.ts        # LEAF — isAsyncFunction / isPromiseLike
│
├── rules/          # AUTHOR primitive → ./rules · OWNS its types+enums+impl
│                   #   types: InternalRule, EmittableRule, EmitContext, RulePlan*
│                   #   enums: RequiredType, RuleOp, RulePlanExprKind, RulePlanCheckKind, CacheKey
│                   #   impl: string…(split Phase E), number…, typechecker, combinators,
│                   #         create-rule, rule-plan, rule-metadata
├── transformers/   # AUTHOR primitive → ./transformers · OWNS Transformer/TransformParams/TransformFunction + impls
│
├── metadata/       # IR layer (ABOVE author primitives) — the schema decorators write & seal reads
│                   #   types: RawClassMeta, RawPropertyMeta, RuleDef, TransformDef, ExposeDef,
│                   #          ExcludeDef, TypeDef, PropertyFlags, ClassCtor, MessageArgs
│                   #   enums: CollectionType (TypeDef references it)
│                   #   impl:  collect, meta-access   (read/write RAW on the class via symbols)
│                   #   imports ↓ rules (InternalRule), transformers (Transformer), symbols, errors
├── decorators/     # AUTHOR → ./decorators — @Field etc. PRODUCE metadata
│                   #   enums: ExcludeMode ; Direction (lowest consumer = decorators+seal → here)
│                   #   imports ↓ metadata, rules, transformers, errors
├── seal/           # COMPILE — owns its output + options
│                   #   types: SealedExecutors ; interfaces: SealOptions, RuntimeOptions
│                   #   enums: GuardKey  (Direction is imported downward from decorators/, not owned here)
│                   #   impl:  seal, deserialize-builder, serialize-builder, compile-cache,
│                   #          async-analysis, merge-inheritance, circular-analyzer,
│                   #          expose-validator, validate-meta, codegen-utils
│                   #   imports ↓ metadata, rules, decorators(schema), errors
│                   #   (config is ABOVE seal — config imports SealOptions from seal, not vice versa)
├── config/         # normalizeConfig (BakerConfig → SealOptions) ; imports ↓ errors, seal(SealOptions type)
├── runtime/        # RUN (rename of functions/) — deserialize/serialize/validate, check-call-options
│                   #   imports ↓ seal (SealedExecutors, RuntimeOptions), errors
└── baker.ts        # ROOT — composition root ; imports ↓ config, seal, runtime
```

### The one irreducible seam (document, don't fight)
`rules/` `EmittableRule.emit(ctx)` / `EmitContext.addExecutor(exec: SealedExecutors)` references
`SealedExecutors`, which `seal/` owns. That is the visitor pattern: rules define `emit`, seal supplies
the context and calls it. It is a single **type-only (erased) forward edge `rules → seal`**, kept as
`import type` so there is no runtime cycle (dpdm sees none). This is the ONLY upward edge; everything
else is strictly downward. (It exists today inside the monolithic `types.ts`; the split makes it an
explicit, commented `import type`.)

### Placement decisions that bit the earlier draft (corrected)
- `Transformer*` → **transformers/** (its owner); `TransformDef`(metadata) imports it downward.
- `RequiredType`/`RuleOp`/`RulePlan*`/`CacheKey` → **rules/**; metadata/seal import downward.
- `CollectionType` → **metadata/** (lowest consumer: `TypeDef`); seal imports downward.
- `RuntimeOptions`/`SealOptions`/`SealedExecutors` → **seal/** (lowest consumer of each is seal, via
  `SealedExecutors`'s signature); runtime/config/baker import downward.
- `Direction` → **decorators/** (lowest of {decorators, seal}); seal imports downward.
- `ExcludeMode` → **decorators/** (sole consumer).

---

## Phase 0 / 1 (DONE)
P0 enum conversion. P1 (5.0/5.1): `Baker` class, per-baker runtime `app.deserialize/validate/serialize`,
global runtime + `Class[SEALED]` + `SEALED` symbol removed, executors in each Baker's `#executors` map,
`(class,config)` compile cache + cache-hit nested seeding, `Baker.#require` prototype-chain walk.

## Phase A — compile-cache extraction (FIRST: self-contained, spec-backed, zero codegen risk)
Extract `seal/compile-cache.ts` (the WeakMap + `configFingerprint`/`getCached`/`setCached`/`clearCached`/
`clearAllCached`). It already has a committed spec (`src/seal/compile-cache.spec.ts`, repoint its import)
and a consumer (`test/integration/helpers/unseal.ts` imports `clearAllCached`). Touches no `new Function`
body. Of seal.ts's 7 test-only exports it relocates the cache ones; the rest (`mergeInheritance`,
`circularPlaceholder`) move in Phase C.
Gate: suite green; codegen unchanged.

## Phase B — establish the skeleton (moves only, no logic change)
1. `functions/` → **`runtime/`** (repoint imports; `functions` is not in `package.json` exports or
   `index.ts`, so no published path changes).
2. Create **`errors/`**, **`metadata/`**, **`config/`**; move `errors.ts`→`errors/`,
   `collect.ts`+`meta-access.ts`→`metadata/`, `configure.ts`→`config/` (owns `normalizeConfig` +
   `BakerConfig` type + `BAKER_CONFIG_KEYS`). Leave `symbols.ts`, `utils.ts`(or a `utils/`), `baker.ts`
   at root.
3. `index.ts` re-export paths repointed. NOTE: `index.ts` publicly re-exports `RequiredType`/`ExcludeMode`
   (from enums) and `EmittableRule`/`Transformer`/`TransformParams` (from types) — Phase C moves those
   symbols (`EmittableRule`→rules/, `Transformer*`→transformers/, `RequiredType`→rules/, `ExcludeMode`→
   decorators/), so these PUBLIC re-exports must be repointed then (public-barrel edit, not just internal).
Gate: `tsc` + suite green; `deps:check` no new cycles; public **type surface (names+shapes) unchanged**
(note: emitted `.d.ts` *internal re-export paths* necessarily change on a move — that is expected; the
invariant is the public names/shapes, not byte-identical `.d.ts`).

## Phase C — dissolve `types.ts`/`enums.ts`/`interfaces.ts` into their owning domains
Apply the placement table above. Create `metadata/` IR types, `rules/` types+enums, `transformers/`
types, `decorators/` enums, `seal/` types+interfaces. Relocate `create-rule`/`rule-plan`/`rule-metadata`
into `rules/`. Mark the `rules → seal` `EmitContext`→`SealedExecutors` edge `import type` and comment it.
Also extract `seal/async-analysis.ts` (`analyzeAsync`+`nestedClassesOf`), `seal/merge-inheritance.ts`,
and `circularPlaceholder` out of `seal.ts` (each carries a test-only export) → `sealOne` becomes a clean
~160-line orchestrator. Do NOT fragment `sealOne`'s inline pipeline (typedef normalization stays inline).
Gate: `tsc` + suite green; `deps:check` clean — **verify zero edge from a lower layer up to a higher one
except the single documented `rules → seal` erased type edge**; codegen byte-identical.

## Phase D — decompose the big builders
Split `deserialize-builder.ts` (1986) + `serialize-builder.ts` (446) into single-purpose codegen modules
(verbatim): error-codegen, conversion-codegen, expose-resolver, guard-strategies, rule-analysis,
issue-extras, emit-context, rule-emitter, nested-codegen, nested-codegen-validate, field-codegen,
transform-codegen, serialize-field-codegen, slim drivers. **Cycle break:** `field-codegen ↔
nested-codegen-validate` via an `emitField` callback (dependency inversion) — this alters the codegen
call path, so do it as its own separately-gated commit (extract the leaf modules verbatim first).
Gate: byte-identical codegen — **mechanized** (see harness below), not eyeballed.

## Phase E — `rules/string.ts` split (DEFERRED — lowest value, last or skip)
2525 lines, flat, low-coupling. Split by concern behind a pure re-export barrel so `rules/index.ts`
(the `./rules` subpath) stays byte-stable. Pure churn; schedule last or defer.

## Phase F — barrels / exports / `.d.ts` close-out
Per-directory barrels; public barrels + root `/index.ts` + `./symbols` stable. `.d.ts` review,
`deps:check`, `knip`. Optional nit: de-dupe `runtime/` `run*` unwrap/guard helpers.

---

## Prerequisite — codegen-snapshot harness (build BEFORE Phase C/D)
The "byte-identical codegen" invariant is currently only asserted. Add a `bun test` that, for a
representative DTO set, captures each generated executor's source (`sealed.deserialize/serialize/
validate.toString()`, reachable via the test-only `getCached(Cls, configFingerprint(opts))`) into a
committed snapshot and diffs it. (Captures the generated **body text** only — injected closure data
like `refs`/`regexes`/`execs` is not part of `.toString()`; that is exactly the "codegen byte-identical"
invariant, which is about the body.) Land it as its own commit before any seal/
builder code is moved (Phases C/D feed/own codegen), so drift is machine-checked every commit. Phases
A/B don't touch codegen but the harness should exist before C.

## Execution order (each step = one commit; `tsc` + suite green; codegen byte-identical)
1. ~~P0 enums~~, ~~P1 Baker/runtime/cache~~ (DONE).
2. **A** — extract `compile-cache.ts` (safest, spec-backed first win).
3. **snapshot harness** (machine-check codegen byte-identity).
4. **B** — skeleton: `functions/`→`runtime/`, create `errors/` + `metadata/`, move substrate.
5. **C** — dissolve `types/enums/interfaces` into owning domains; extract seal analysis modules.
6. **D** — builder decomposition (leaf modules verbatim, then `emitField` cycle-break as its own commit).
7. **F** — barrels/exports close-out + de-dupe nit.
8. **E** — string.ts split (deferred/last/optional).

Each phase independently revertible; regressions isolate to one layer.

---

## Invariants (every commit)
- `bunx tsc --noEmit` clean; `bun test` fully green (currently 2335 pass).
- Generated `new Function` bodies byte-identical (snapshot-checked from Phase C onward).
- Public surface unchanged: `/index.ts` names+shapes, subpath barrels (`./rules`, `./transformers`,
  `./decorators`, `./symbols`), `package.json` exports. `./symbols` keeps pointing at root `symbols.ts`.
- **Strict downward layering**: leaves(symbols/errors/utils) ← rules·transformers ← metadata ←
  decorators ← seal ← {config, runtime} ← baker. The ONLY upward edge permitted is the documented
  type-only `rules → seal` (`EmitContext.addExecutor: SealedExecutors`). `deps:check` clean; `knip` clean.
- `verbatimModuleSyntax` respected.

---

## Forward-looking — OpenAPI 3.0
`app.toOpenAPI()` walks the type graph from the roots a baker collected — per-app isolation falls out of
the `Baker` boundary; class identity stays the isolation boundary; single-app projects have one `Baker`.
