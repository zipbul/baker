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

**Two kinds of home — DOMAIN vs COMMON (the distinction that was muddled before):**

- **Pipeline DOMAIN** — a stage that owns a cohesive responsibility (`rules`, `transformers`,
  `metadata`, `decorators`, `seal`, `config`, `runtime`). A domain owns its TYPES + ENUMS +
  IMPLEMENTATION together (`transformers/` owns the `Transformer` type AND `trimTransformer`; `rules/`
  owns `InternalRule`/`RequiredType` AND `isString`).
- **COMMON** — cross-cutting primitives with **no semantic owning stage**, used across the pipeline.

**Membership test (objective): "Is there a single stage that *semantically owns* this symbol — the
place a developer would naturally look for it?"** If yes → that domain. If no (it's a pipeline-wide
primitive/concept) → `common/`. Note this is *semantic* ownership, not merely "fewest importers":
`CollectionType` (Map/Set of a field) is owned by `metadata` even though `seal` also reads it, because
`TypeDef` *defines* it; `Direction` (Deserialize/Serialize) is owned by **nobody** — it is the
pipeline's two directions — so it is common even though only decorators+seal use it.

Applying the test to the genuinely-ownerless symbols (verified by usage): `errors`
(`BakerError` used by 6 areas), `utils` (`isAsyncFunction`/`isPromiseLike`), `Direction`,
`CacheKey` (codegen cache key, rules+seal, no single owner), `ClassCtor` (generic `new(...)=>T`) → all
**common**. `symbols` (the RAW metadata symbol) is common by nature but **pinned at root** (published
`./symbols` subpath + `Symbol.metadata` polyfill load-order). Everything with a real owner stays in its
domain — there is **no "core kernel" holding other domains' types** (that inverts the arrows;
`Transformer` is transformers', not common).

**The RAW metadata IR is a layer, not a leaf.** `Raw*Meta` + the `*Def` family *aggregate* the author
domains' types (`RuleDef.rule: InternalRule`, `TransformDef.fn: TransformFunction`), so the IR sits
ABOVE `rules/`/`transformers/` and imports them downward — it is NOT a leaf below them.

---

## Target skeleton (bottom → top; every import points downward)

```
src/
├── symbols.ts      # COMMON-by-nature but ROOT-PINNED — Symbol.metadata polyfill (load-order) + published ./symbols.
├── common/         # NO owning stage — cross-cutting primitives (the bottom leaf; imports nothing from a stage)
│                   #   errors/ : BakerError, BakerIssue(Set), guards, toBakerIssueSet, BAKER_ERROR
│                   #   utils   : isAsyncFunction, isPromiseLike
│                   #   enums     : Direction, CacheKey         (no semantic owner)
│                   #   types     : ClassCtor                   (generic new(...)=>T)
│                   #   interfaces: RuntimeOptions              (seam: seal threads it, runtime consumes — neither owns)
│
├── rules/          # DOMAIN (author primitive) → ./rules · OWNS its types+enums+impl
│                   #   types: InternalRule, EmittableRule, EmitContext, RulePlan*
│                   #   enums: RequiredType, RuleOp, RulePlanExprKind, RulePlanCheckKind
│                   #   impl:  string…(split Phase E), number…, typechecker, combinators,
│                   #          create-rule, rule-plan, rule-metadata
├── transformers/   # DOMAIN (author primitive) → ./transformers · OWNS Transformer/TransformParams/TransformFunction + impls
│
├── metadata/       # DOMAIN — IR layer (ABOVE author primitives): the schema decorators write & seal reads
│                   #   types: RawClassMeta, RawPropertyMeta, RuleDef, TransformDef, ExposeDef,
│                   #          ExcludeDef, TypeDef, PropertyFlags, MessageArgs
│                   #   enums: CollectionType  (TypeDef defines it — metadata is its semantic owner)
│                   #   impl:  collect, meta-access   (read/write RAW on the class via symbols)
│                   #   imports ↓ rules (InternalRule), transformers (Transformer), common, symbols
├── decorators/     # DOMAIN → ./decorators — @Field etc. PRODUCE metadata
│                   #   enums: ExcludeMode  (sole consumer = decorators)
│                   #   imports ↓ metadata, rules, transformers, common
├── seal/           # DOMAIN (compile) — owns its output + options
│                   #   types: SealedExecutors ; interfaces: SealOptions ; enums: GuardKey
│                   #   (RuntimeOptions is in common/ — seal only threads it through SealedExecutors' signature)
│                   #   impl:  seal, deserialize-builder, serialize-builder, compile-cache,
│                   #          async-analysis, merge-inheritance, circular-analyzer,
│                   #          expose-validator, validate-meta, codegen-utils
│                   #   imports ↓ metadata, rules, decorators(schema), common
│                   #   (config is ABOVE seal — config imports SealOptions from seal, not vice versa)
├── config/         # DOMAIN — normalizeConfig (BakerConfig → SealOptions) ; imports ↓ common, seal(SealOptions type)
├── runtime/        # DOMAIN (run, rename of functions/) — deserialize/serialize/validate, check-call-options
│                   #   imports ↓ seal (SealedExecutors), common (RuntimeOptions, errors)
└── baker.ts        # ROOT — composition root ; imports ↓ config, seal, runtime
```

### The one irreducible seam (document, don't fight)
`rules/` `EmittableRule.emit(ctx)` / `EmitContext.addExecutor(exec: SealedExecutors)` references
`SealedExecutors`, which `seal/` owns. That is the visitor pattern: rules define `emit`, seal supplies
the context and calls it. It is a single **type-only (erased) forward edge `rules → seal`**, kept as
`import type` so there is no runtime cycle (dpdm sees none). This is the ONLY upward edge; everything
else is strictly downward. (It exists today inside the monolithic `types.ts`; the split makes it an
explicit, commented `import type`.)

### Placement decisions (by the semantic-owner test)
- **DOMAIN (has an owner):**
  - `Transformer*` → **transformers/** (its owner); `TransformDef`(metadata) imports it downward.
  - `RequiredType`/`RuleOp`/`RulePlan*` → **rules/**; metadata/seal import downward.
  - `CollectionType` → **metadata/** (`TypeDef` defines it); seal imports downward.
  - `MessageArgs` → **metadata/** (structural member of `RuleDef`/`RawPropertyMeta` — owned by the IR, not by whoever consumes it).
  - `SealOptions`/`SealedExecutors` → **seal/** (seal produces/owns them); runtime/config/baker import downward.
  - `ExcludeMode` → **decorators/** (sole consumer).
- **COMMON (no owner — fails the test):**
  - `Direction` (Deserialize/Serialize — pipeline-wide), `CacheKey` (codegen cache key, rules produce / seal consume),
    `ClassCtor` (generic constructor), `errors`, `utils` → **common/**.
  - `RuntimeOptions` → **common/** (seam): seal only *threads* it through `SealedExecutors`' signature and
    runtime *consumes* it — neither owns it (mirrors `CacheKey`). Putting it in `runtime/` would create a
    `seal → runtime` upward edge via `SealedExecutors`; `common/` keeps the seam below both. It is published
    (`index.ts`), so its public re-export repoints to `common/`.
  - `symbols` → common-by-nature but **root-pinned** (published subpath + polyfill load-order).

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
2. Create **`common/`**, **`metadata/`**, **`config/`**; move `errors.ts`→`common/errors/`,
   `utils.ts`→`common/`, `collect.ts`+`meta-access.ts`→`metadata/`, `configure.ts`→`config/` (owns
   `normalizeConfig` + `BakerConfig` type + `BAKER_CONFIG_KEYS`). Leave `symbols.ts` and `baker.ts` at root.
   (The cross-cutting enums `Direction`/`CacheKey` + `ClassCtor` land in `common/` during Phase C.)
3. `index.ts` re-export paths repointed. NOTE the PUBLIC re-exports that move (each is a public-barrel
   edit, not just internal): `RequiredType`→rules/, `ExcludeMode`→decorators/, `EmittableRule`→rules/,
   `Transformer`/`TransformParams`→transformers/ (Phase C); `BakerConfig`→config/ (Phase B);
   `RuntimeOptions`→common/ (Phase C). Repoint each as its symbol moves.
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
4. **B** — skeleton: `functions/`→`runtime/`, create `common/` + `metadata/` + `config/`, move substrate.
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
- **Strict downward layering**: `common/` (+ root `symbols`) ← rules·transformers ← metadata ←
  decorators ← seal ← {config, runtime} ← baker. `common/` imports NOTHING from any stage (if it would
  need to, the symbol has an owner and isn't common). The ONLY upward edge permitted is the documented
  type-only `rules → seal` (`EmitContext.addExecutor: SealedExecutors`). `deps:check` clean; `knip` clean.
- `verbatimModuleSyntax` respected.

---

## Forward-looking — OpenAPI 3.0
`app.toOpenAPI()` walks the type graph from the roots a baker collected — per-app isolation falls out of
the `Baker` boundary; class identity stays the isolation boundary; single-app projects have one `Baker`.
