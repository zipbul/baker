# Plan — Baker-scoped runtime, single source of truth (release as 5.1)

> Principled redesign (정공법), not a compat band-aid. The earlier draft kept the global
> `deserialize/validate/serialize` alive via dual-write to `Class[SEALED]` purely to stay
> "non-breaking minor" — that preserved the flawed global path and merely relocated the silent-config
> bug (global=A vs app=B). This version removes the global path entirely: one source of truth.
>
> Versioning: removing exported functions is a public break = semver major. The release is labelled
> **5.1** by maintainer decision (no real consumers yet). Design is done at major scope; the number is
> just the tag.

## Problem

Each `Baker` is meant to be an isolated app context with its own config, but the sealed executor is
stored once per class (`Class[SEALED]`) and `deserialize/validate/serialize` are global (no baker
context). Same class + two configs → one slot → silent first-seal-wins (also transitively via shared
nested DTOs). Contradicts "apps never mix".

## Goal

Runtime resolution goes through the baker. The same class behaves per **each baker's** config, with
**no** global fallback that could diverge. Completes the Baker-only philosophy (global `@Recipe`/
`seal`/`configure` were already removed; this removes the last global remnant — the runtime fns).

## Design — single source of truth

| State | Lives in | Rationale |
| --- | --- | --- |
| **RAW** (field + rule schema) | class `Symbol.metadata[RAW]` (unchanged) | written by `@Field`; class-intrinsic; identical across apps → shared |
| **SEALED** (config-compiled executor) | **the Baker instance only** (`#executors: Map<Function, SealedExecutors>`) | depends on config → per-app, single owner |

- **Remove** `Class[SEALED]` storage and the global `deserialize/validate/serialize` (+Sync/Async)
  exports. Remove `meta-access` SEALED helpers (`setSealed/getSealed/hasSealedOwn/deleteSealed`) and the
  global `ensureSealed`; replace with baker-map equivalents.
- Runtime is **`app.deserialize/validate/serialize`** (+Sync/Async) only. Single-app users hold one
  `app` and call `app.deserialize(...)` — barely more verbose, and unambiguous.

### Why feasibility holds (from review)

Nested executors are resolved at **build time** and captured by lexical closure into a per-executor
`execs[]` array the generated `new Function` indexes; the runtime body has zero `getSealed` lookups
(`deserialize-builder.ts:1467-1470,1290-1310,1440-1445`; `serialize-builder.ts:376-379,332-334,
251-272`; circular via in-place `Object.assign`, `seal.ts:290`). So **generated code does not change** —
each baker that runs its own seal traversal weaves a self-consistent graph, as long as the build-time
resolution source is the baker's own map.

### Baker API

```ts
class Baker {
  readonly Recipe          // unchanged — registers a root into this baker
  readonly seal            // compiles roots (+nested) with this.#options into #executors

  deserialize(Cls, input, opts?)   deserializeSync(...)   deserializeAsync(...)
  validate(Cls, input, opts?)      validateSync(...)      validateAsync(...)
  serialize(instance, opts?)       serializeSync(...)     serializeAsync(...)
}
```

- Each method resolves `this.#executors.get(Cls)` (serialize: `instance.constructor`) and **reuses the
  existing `src/functions/*` logic** — `checkCallOptions`, the `isAsync`/Result-unwrap dispatch, and
  serialize's instance-forgery security check (`resolveSerializer`). Refactor each `src/functions/*`
  helper to take the executor (or a resolver) as input instead of calling the global `ensureSealed`;
  the Baker methods pass `this.#executors`. No logic duplication.
- Missing class → `BakerError` "`<Cls> is not sealed by this baker`" (also covers nested-only classes,
  which land in the map too).

### seal() — thread a SealContext through the whole traversal (the core work)

The single-global-slot assumptions move to a per-seal context threaded everywhere. Bundle it as a
**`SealContext` = { map, options, sealedAcc, resolve(cls) }`** (review suggestion, adopted) to limit
signature churn across `sealRegistry`/`sealOne`/the builders/`analyzeAsync`:

- `sealRegistry`/`sealOne` take the context: placeholder set in `ctx.map`; recursion guard
  `hasSealedOwn(Cls)` → `ctx.map.has(Cls)`; rollback → `ctx.map.delete(Cls)`; placeholder self-clean → map.
- `analyzeAsync` (`seal.ts:54`) reads `ctx.map` **through its recursion** (it recurses — thread the
  context all the way down), not the global `getSealed`.
- `buildDeserializeCode`/`buildValidateCode`/`buildSerializeCode` + nested/collection/discriminator/
  inline/validate-only helpers resolve nested executors via `ctx.resolve(cls)`, replacing **every**
  build-time `getSealed(nestedCls)` in both builders. **Re-derive the exact site list by grep at impl
  time** — the v2 line list was stale (it listed non-`getSealed` lines like 1626/1686/1725 and missed
  `deserialize-builder.ts:1791`). **Generated code unchanged** — only the build-time capture source.
- Invariant: `ctx.resolve(cls)` must return the **same object** `ctx.map.set` stored, so the circular
  `Object.assign`-in-place upgrade (`seal.ts:290`) still propagates to every `execs[]` slot that captured
  the placeholder. Each baker's placeholder is its own object → circular fixup is naturally baker-isolated.
- Also remove the now-unused `meta-access` SEALED helpers — `setSealed/getSealed/hasSealedOwn/
  deleteSealed` **and `requireSealed`** (the v2 plan forgot `requireSealed`) — plus the global
  `ensureSealed`; replace with `ctx.map` lookups + a baker-map "not sealed by this baker" error.
- Transactional rollback stays, retargeted to the map.

### Frozen-RAW re-seal fix (subtle — the load-bearing correctness item)

`freezeRaw` (`seal.ts:163`) freezes RAW after first seal; per-baker re-seal of a shared class re-runs
`sealOne` on frozen RAW and the **single-ancestor fast-path** in `mergeInheritance` (`needsCopy===false`,
`seal.ts:342/358`) returns `merged[key] === raw[key]` **by reference**; normalization then mutates
flags/type in place (`seal.ts:239-249`) → throws on frozen RAW, or silently mutates shared RAW (cross-baker
contamination) if not frozen. Fix: **never mutate RAW** — force a copy of each `meta` (incl. `flags`) on
the `needsCopy===false` path too (i.e. make `mergeInheritance` always return copies, or copy
unconditionally in the normalize loop). Then `freezeRaw` is unnecessary → drop it. Add a RED test that
seals the same single-level DTO (with a nested field) in two bakers back-to-back.

## Isolation invariants (verified against the code — what makes it "perfect")

Per-app **config** isolation is perfect **iff** these hold (the first two are the plan's blockers):

1. **Every** nested-executor resolution reads the baker's map (no surviving `getSealed`/`Class[SEALED]`).
2. **RAW is never mutated.** Verified: in production RAW is written once by `@Field` (`collect.ts:21`) at
   class-definition; `setRaw` is test-only. The sole production RAW mutation is `seal.ts:240`
   (`meta.flags = {...}`) which, on the `needsCopy===false` single-chain path (`seal.ts:358`, where
   `merged[key] === RAW[key]`), mutates the shared RAW object. The copy-fix closes exactly this.
3. **No other shared mutable state** (verified): no module-level Map/Set keyed by class in seal/builders;
   codegen does not mutate rule/transformer objects; `regexes`/`refs`/`execs` are per-build function-local.

What is intentionally **shared** (not a leak): the field **schema (RAW)** — same class = same fields by
definition. Different fields ⇒ different class. Only config-derived behavior (the executor) is per-baker.

**Leak-detection test (add):** seal the same class in `appA` and `appB`; run `appA.deserialize` then
mutate nothing but assert `appB.deserialize` is wholly unaffected by A's config, AND that re-sealing in
B did not change A's behavior (round-trip both directions) — proves no shared-state coupling.

## Executor sharing — `(class, config)` content-addressed cache (triple-reviewed, validated)

Memoize compiled executors globally by **`(class, configFingerprint)`** so bakers with matching config
share one executor (compiled once), while different-config bakers stay isolated. Restores 5.0's
dedup/compile-once on top of 5.1's isolation. Reviews confirmed `(class, config)` is a COMPLETE & SAFE
key under three conditions:

1. **Built on the per-baker graph-sealing foundation** (NOT first-seal-wins). Executors capture nested
   executors by reference (`execs[]`); a naive cache on the old single-slot code would let one baker embed
   another's nested-config behavior. Because each baker re-seals its full reachable graph under one config
   and config propagates identically to nested, keying the whole graph by config is consistent → key is
   complete. (Rule/transformer/validateIf/context identity need NOT be in the key — RAW is single-instance
   per class, so class identity subsumes them. Verified.)
2. **`configFingerprint` is a VALUE fingerprint** over normalized `SealOptions` (booleans), not the object
   reference (`normalizeConfig` returns a fresh frozen object each call → `===` never hits). Canonical,
   total, collision-free; no non-hashable config members exist.
3. **Cache stores the EXACT placeholder object reference** (circular `Object.assign`-in-place contract,
   `seal.ts:290`) — never a copy; a mid-graph circular pull returns the placeholder that gets back-patched.

Storage: `WeakMap<class, Map<configFingerprint, SealedExecutors>>`; a baker's `#executors.get(C)` points at
the shared entry. Cache value = config-isolation correctness + same-config dedup; runtime call speed
unchanged (identical pure functions). May ship WITH core 5.1 or immediately after (core isolation is
correct without it).

## Consequences (honest)

- All call sites are `app.*` (baker available via DI/request scope in a framework — normal).
- Without the cache: same class in N bakers = N executors. With the `(class,config)` cache: one executor
  per distinct (class, config) — same-config bakers share, compile-once.
- A `Baker` MUST be app-scoped and sealed once at startup — never request-scoped (request-scoped
  re-seal would recompile per request). Also the cache's inner Map is bounded only for a fixed
  class/config set (no eviction) — state both as requirements in README.
- Public break: global runtime functions removed → real consumers would need `app.deserialize(...)`.
  Released as 5.1 by maintainer decision.

## Test-helper redesign (BLOCKER — NOT mechanical)

The `sealClass`/`unseal` helpers (`test/integration/helpers/{seal,unseal}.ts`, used by ~23 files)
collapse under per-baker maps:

- `sealClass(cls)` today makes a throwaway `new Baker()`, seals, **discards the baker**, relying on the
  executor landing on global `Class[SEALED]` so the global `deserialize(cls, x)` finds it. With per-baker
  maps the executor dies with the throwaway baker → nothing to call.
- `unseal()` restores via `getSealed/deleteSealed/setRaw` — all global/removed. Worse, its
  `setRaw(Class, sealed.merged)` becomes actively wrong once the RAW-copy fix means RAW was never mutated
  (it would overwrite pristine RAW with a normalized copy).

→ Redesign: **`sealClass(cls): Baker`** returns the baker; tests call `app.deserialize(...)` on it.
`unseal()` is deleted — dropping the baker drops the executor (the GC story we want). Note `boundary-values.test.ts`
defines DTOs inside `it()` and seals via `sealClass`'s baker, not the module baker — those must use the
returned baker. This is structural, ~23 files.

## Docs/tests to update

- `index.ts` — drop global `deserialize/validate/serialize` (+Sync/Async) exports; surface stays `Baker`
  + decorators + rules/errors/types.
- **Specs that test the removed mechanism must be DELETED/REWRITTEN, not migrated:**
  `src/meta-access.spec.ts` (SEALED-slot + `freezeRaw` blocks → delete), `src/symbols.spec.ts`
  (SEALED-symbol assertions → delete/trim), `src/baker.spec.ts` (`getSealed(UserDto)` assertions →
  rewrite to assert via `app.deserialize` behavior), `src/seal/seal.spec.ts` (~20 `getSealed/setSealed`
  assertions → rewrite around the map / behavior).
- `test/e2e/multi-app-isolation.test.ts` — rewrite the header comment (7-9) AND the shared-class tests
  (70-87, 89-110): from "first-seal-wins / shared reuse" to "each baker diverges per its own config".
- Migrate the remaining ~890 global runtime call-sites across ~75 files to `app.*` (mechanical where a
  baker is already in module scope; the `sealClass` subset above is NOT mechanical).
- `src/baker.ts` doc (currently says runtime fns "stay global, read the class") + `src/types.ts:188`
  comment + README — fix to: SEALED is per-baker (true isolation), Baker is app-scoped (seal once).

## Test plan (RED-first)

1. RED: `appA({autoConvert:false})` + `appB({autoConvert:true})` seal the **same** class →
   `appA.deserialize(C,{n:'42'})` issue, `appB.deserialize(C,{n:'42'})` ok.
2. Transitive nested: two roots/two bakers share a nested DTO with different configs → each isolated
   (the codegen-resolver regression test).
3. `app.deserialize` on a class not sealed by that baker → BakerError.
4. `app.validate`/`app.serialize` (+Sync/Async) parity; serialize forgery check preserved.
5. Circular + transactional rollback within a baker's map (port seal.spec cases).
6. Frozen-RAW: same single-level DTO sealed by two bakers back-to-back → no throw, each isolated.
7. Memory: same-class-in-N-bakers = N executors; bakers GC when dropped (measure).

## Scope (files that change)

1. `src/baker.ts` — `#executors` + 9 methods + `SealContext`-threaded `seal`.
2. `src/seal/seal.ts` — `SealContext` in `sealRegistry`/`sealOne`; `analyzeAsync` reads map through
   recursion; map-aware "not sealed by this baker" error (replaces `ensureSealed`); drop `freezeRaw`;
   RAW-copy fix at the `needsCopy===false` fast-path; remove global-slot reliance.
3. `src/seal/deserialize-builder.ts` + `src/seal/serialize-builder.ts` — thread `ctx.resolve(cls)` to
   EVERY `getSealed` site (re-derive by grep). Note serialize computes `Class` from `instance.constructor`
   after the forgery check → its function takes `(resolve, instance)`, while deserialize/validate take a
   pre-resolved executor.
4. `src/functions/*.ts` — parameterize by executor/resolver; baker methods reuse the dispatch
   (`checkCallOptions`, isAsync branch, Result unwrap, `resolveSerializer` forgery check).
5. `src/meta-access.ts` — remove SEALED helpers incl. `requireSealed` (RAW helpers stay).
6. `index.ts` — remove global runtime exports.
7. `test/integration/helpers/{seal,unseal}.ts` — redesign (`sealClass` returns baker; delete `unseal`).
8. ~75 test files / ~890 call-sites → baker methods; spec deletions/rewrites listed above.

## Rollout

Changeset labelled **minor (5.1)** per maintainer call — but its body and the PR title MUST carry an
explicit `BREAKING CHANGE: global deserialize/validate/serialize removed — use app.deserialize/validate/
serialize` line (the version number is a minor bump by decision; the API change is real and must be
documented as breaking). RED-first TDD; suite green each step; changeset release flow.
