# @zipbul/baker — Refactoring Plan

Goal: a precise, SRP-compliant module and type structure. Behavior-preserving except for
one explicit correctness fix (multi-instance global state). The 2340-test suite (99%+ line
coverage) pins behavior; every phase must keep `tsc` clean and all tests green. Hot codegen
paths run once at `seal()` (never per call), so module splits are runtime-perf-neutral; the
only carve-outs needing a benchmark check are the generated `new Function` bodies, which must
stay byte-identical.

Conventions enforced throughout:
- Per-directory type organization: `enums.ts` / `types.ts` / `constants.ts` / `interfaces.ts`.
- Directory-scoped barrels (`index.ts`); cross-directory imports go through the barrel.
- Strict, precise named exports — no `export *`, internal-only symbols stay out of barrels.
- `export type` / `import type` for type-only, plain `export` / `import` for runtime values
  (enforced by `verbatimModuleSyntax`).
- Move functions verbatim; never "tidy" the documented micro-optimizations during extraction.

---

## Phase 0 — Status (done)

Literal/union → enum conversion is complete and committed on `refactor/literal-unions-to-enums`:
- `src/enums.ts` (string-valued, leaf): `RequiredType`, `Direction`, `CollectionType`, `CacheKey`,
  `RuleOp`, `RulePlanExprKind`, `RulePlanCheckKind`, `ExcludeMode`.
- `src/seal/enums.ts`: `GuardKey`.
- Public exports: `RequiredType`, `ExcludeMode`.
- Test hardening: RulePlan emit assertions pin all six `RuleOp` operator strings.

---

## Phase 1 — Multi-instance global state fix (CORRECTNESS, not behavior-preserving)

### Problem
`src/symbols.ts` deliberately uses **global** symbols (`Symbol.for('baker:raw' | 'baker:sealed')`)
so AOT and runtime code share markers across module instances. But the seal **index and seal
flag are module-local**, contradicting that intent:

```ts
// src/registry.ts
export const globalRegistry = new Set<Function>();      // module-local
// src/seal/seal-state.ts
let sealed = false;                                     // module-local
export const sealedClasses = new Set<Function>();       // module-local
```

When two baker instances load in one runtime (e.g. an app inlines baker while a middleware lib
ships it `--packages external`), `@Recipe` registers a DTO into instance B's `globalRegistry`,
but the app's argless `seal()` (instance A) only iterates A's registry. B's DTO is never sealed
— the `SEALED` marker (global) is never attached to it — so `deserialize/validate/serialize`
throws `"<Class> is not sealed"` forever. The same split affects the `sealed` flag and
`sealedClasses`.

### Fix
Apply the `symbols.ts` principle (global symbol key + single instance on `globalThis`) to the
registry and seal state:

```ts
// src/registry.ts (after core reorg this lives in the chosen home; logic identical)
const REGISTRY_KEY = Symbol.for('baker:registry');
const g = globalThis as Record<symbol, unknown>;
g[REGISTRY_KEY] ??= new Set<Function>();
export const globalRegistry = g[REGISTRY_KEY] as Set<Function>;
```

```ts
// src/seal/seal-state.ts — share both the flag and the set
const STATE_KEY = Symbol.for('baker:seal-state');
const g = globalThis as Record<symbol, unknown>;
g[STATE_KEY] ??= { sealed: false, sealedClasses: new Set<Function>() };
const state = g[STATE_KEY] as { sealed: boolean; sealedClasses: Set<Function> };

export const sealedClasses = state.sealedClasses;
export function isSealed(): boolean { return state.sealed; }
export function markSealed(): void { state.sealed = true; }
export function resetForTesting(): void { state.sealed = false; state.sealedClasses.clear(); }
```

### Tests (RED-first)
- A unit test asserting `globalRegistry` and the seal-state object are identity-shared via the
  `Symbol.for` keys on `globalThis` (simulates a second instance reading the same key).
- An integration test: register a class, mark sealed, and confirm a freshly-imported view of the
  state module observes `isSealed() === true` and the same `sealedClasses` membership.

This phase ships as its own commit + changeset (it is a user-visible bug fix). Do it before the
structural moves so `registry.ts`/`seal-state.ts` are correct before they relocate.

---

## Phase 2 — CORE type/responsibility split (root `src/`)

`src/types.ts` is a 5-domain junk drawer imported by 27 modules. Dissolve it; each type moves to
its owning directory. Root keeps only genuinely cross-cutting members.

| Current location | Member(s) | New home |
| --- | --- | --- |
| `types.ts` | `RawClassMeta`, `RawPropertyMeta` | **stay** `src/types.ts` (shared metadata storage) |
| `types.ts` | `EmittableRule`, `InternalRule`, `RulePlan`, `RulePlanExpr`, `RulePlanCheck`, `EmitContext` | `src/rules/types.ts` |
| `types.ts` | `RuleDef`, `MessageArgs`, `ExposeDef`, `ExcludeDef`, `TypeDef`, `PropertyFlags`, `ClassCtor`, `TransformDef` | `src/decorators/types.ts` |
| `types.ts` | `Transformer`, `TransformParams`, `TransformFunction` | `src/transformers/types.ts` |
| `types.ts` | `SealedExecutors` | `src/seal/types.ts` |
| `interfaces.ts` | `RuntimeOptions` | `src/functions/interfaces.ts` |
| `interfaces.ts` | `SealOptions` | `src/seal/interfaces.ts` (root `interfaces.ts` deleted) |
| `errors.ts` | `BakerIssue`, `BakerIssueSet` / `BAKER_ERROR` / `BakerError` / guards | `src/errors/` → `types.ts` / `constants.ts` / `baker-error.ts` / `guards.ts` / `index.ts` |
| `configure.ts` | `BakerConfig` / `BAKER_CONFIG_KEYS` / `configure()` + state | `src/config/` → `types.ts` / `constants.ts` / `configure.ts` / `index.ts` |
| `symbols.ts` | `RAW`, `SEALED` + `Symbol.metadata` polyfill | **keep as-is** (load-order side-effect; published `./symbols`) |
| root | `rule-plan.ts`, `rule-metadata.ts`, `create-rule.ts` | move into `src/rules/` (rules domain) |

Keep at root: `symbols.ts`, `types.ts` (now just `Raw*Meta`), `meta-access.ts`, `collect.ts`,
`registry.ts`, `utils.ts`.

Cycle notes (both are `import type`, erased → no runtime cycle; comment them):
- `EmitContext.addExecutor(executor: SealedExecutors<unknown>)` makes `rules/types` reference
  `seal/types`. Keep as a one-directional erased type edge.
- `config` references `SealOptions` from `seal/interfaces` (erased); `seal` imports
  `getGlobalOptions` from `config` as a value. Net runtime edge is `seal → config` only.

---

## Phase 3 — `rules/` decomposition

### `string.ts` (2524 lines) → cohesive modules + re-export barrel
`makeStringRule` → `string-shared.ts`. Rules split by concern; each module imports only
`string-shared` + `../rule-plan`, no lateral edges. Regex/data consts and checksum helpers move
**with their single consuming rule** (preserves `ctx.addRegex/addRef` dedup identity).

| Module | Rules |
| --- | --- |
| `string-basic.ts` | minLength, maxLength, length, contains, notContains, matches, isLowercase, isUppercase, isAscii, isAlpha, isAlphanumeric, isHttpToken, isBooleanString, isNumberString, isDecimal, isFullWidth, isHalfWidth, isVariableWidth, isMultibyte, isSurrogatePair |
| `string-encoding.ts` | isHexadecimal, isOctal, isBase32, isBase58, isBase64, isHexColor, isRgbColor, isHSL |
| `string-format.ts` | isEmail, isURL, isIP, isMACAddress, isJWT, isLatLong, isDataURI, isFQDN, isPort, isMimeType, isMagnetURI, isJSON, isEthereumAddress, isBtcAddress |
| `string-datetime.ts` | isISO8601, isDateString, isRFC3339, isMilitaryTime |
| `string-identifier.ts` | isUUID, isULID, isCUID2, isMongoId, isFirebasePushId, isSemVer, isHash, isISO31661Alpha2/3, isISO4217CurrencyCode, isLocale, isOrigin, isCorsOrigin, isLatitude, isLongitude, isPhoneNumber, isStrongPassword, isByteLength, isTaxId |
| `string-finance.ts` | isCreditCard, isIBAN, isISBN, isISIN, isISSN, isISRC, isEAN, isBIC, isCurrency |

`string.ts` becomes a **pure re-export barrel** in the original export order, so `rules/index.ts`
(`from './string'`) and the deep imports of `minLength` (`typechecker.spec`,
`deserialize-builder.spec`) stay byte-stable.

### Rule machinery
Split `rule-plan.ts` (two responsibilities glued): `rule-factory.ts` (`makeRule`,
`makePlannedRule`) + `rule-plan.ts` (plan AST builders + `emitRulePlan` codegen). Keep a
re-export shim in `rule-plan.ts` so sibling import lines are unchanged. `rule-metadata.ts`
(branding) and `create-rule.ts` (public API) are already cohesive — relocate into `rules/`
without internal change.

`rules/index.ts` stays the single published `./rules` barrel (no per-category split).

---

## Phase 4 — `seal/` decomposition

`deserialize-builder.ts` (1979 lines) mixes ~9 responsibilities. Extract into single-purpose
modules; the driver keeps only function assembly.

Shared (leaf): `seal/enums.ts` (GuardKey), `seal/interfaces.ts` (FieldCodeContext, GuardParams,
TypeGateConfig, CategorizedRules, ResolvedTypeGate, SealOptions), `seal/types.ts`
(SealedExecutors), `gen-names.ts` (shared GEN names), existing `codegen-utils.ts`.

| Module | Owns |
| --- | --- |
| `error-codegen.ts` | nestedErrPush, nestedErrReturn |
| `conversion-codegen.ts` | generateConversionCode + PRIMITIVE_TYPE_HINTS / ASSERTER_TO_GATE / GATE_ONLY_ASSERTERS |
| `expose-resolver.ts` | extract/output key + expose groups + field-skip, **unified for both directions** (dedups deserialize vs serialize copies) |
| `guard-strategies.ts` | resolveGuardKey, GUARD_STRATEGIES |
| `rule-analysis.ts` | categorizeRules, resolveTypeGate |
| `issue-extras.ts` | buildIssueExtras, computeRuleExtras, computeFieldExtras, makeRuleEmitCtx |
| `emit-context.ts` | makeEmitCtx |
| `rule-emitter.ts` | buildRulesCode + emitRuleList/emitTyped/emitGeneral/emitEach/wrapGroupsGuard/sameGroups |
| `nested-codegen.ts` | generateCollectionCode, generateNestedCode (deserialize) |
| `nested-codegen-validate.ts` | generateCollectionCodeValidateOnly, generateNestedCodeValidateOnly, emitInlineNestedBlock |
| `field-codegen.ts` | generateFieldCode, generateValidationCode |
| `deserialize-builder.ts` | (slim) buildDeserializeCode, buildValidateCode |
| `transform-codegen.ts` | buildSerializeTransformExpr, buildPostNestedTransformCode |
| `serialize-field-codegen.ts` | generateSerializeFieldCode + extracted collection/nested/discriminator/output |
| `serialize-builder.ts` | (slim) buildSerializeCode |
| `typedef-normalizer.ts` | normalizeTypeDefs (from sealOne) |
| `async-analysis.ts` | analyzeAsync, nestedClassesOf |
| `merge-inheritance.ts` | mergeInheritance |
| `seal.ts` | (slim) seal orchestration: seal/sealOne/sealOneClass/sealAllRegistered/ensureSealed |

**Cycle break:** `field-codegen ↔ nested-codegen-validate` is mutual recursion
(`emitInlineNestedBlock` calls `generateFieldCode`). Inject `generateFieldCode` via a new
`emitField` callback field on `FieldCodeContext` (dependency inversion) so
`nested-codegen-validate` depends only on `seal/interfaces.ts`.

Do NOT split the already-cohesive `circular-analyzer.ts`, `expose-validator.ts`,
`validate-meta.ts`, `seal-state.ts`, `codegen-utils.ts`.

---

## Phase 5 — barrels, exports, `.d.ts`

- Add internal barrels where useful (`seal/`, `functions/`); keep public barrels
  (`decorators/`, `rules/`, `transformers/`) and the single published `/index.ts`.
- Repoint `/index.ts` re-export paths only; keep exported **names and shapes identical** so the
  published `.d.ts` is byte-stable. `package.json` `exports` map needs no change (subpaths still
  resolve; `symbols.ts` stays put).
- Run `tsc`, full tests, `bun run deps:check` (dpdm, no new cycles), `knip` (no unused exports),
  and a codegen benchmark spot-check after the seal split.

---

## Execution order (each step = one commit, `tsc` + 2340 tests green)

1. Phase 1 multi-instance fix (+ changeset).
2. Core leaf splits: `errors/`, `config/`, relocate `RuntimeOptions`/`SealOptions`, delete root `interfaces.ts`.
3. Carve domain types: `transformers/types.ts`, `decorators/types.ts`, `rules/types.ts`, `seal/types.ts`; reduce root `types.ts` to `Raw*Meta`; move `rule-plan`/`rule-metadata`/`create-rule` into `rules/`.
4. `string.ts` split (finance → datetime → encoding → format → identifier → basic), then `rule-plan` factory split.
5. `seal/` deserialize decomposition (pure leaves first: error-codegen, conversion-codegen, guard-strategies, interfaces; then rule-analysis, issue-extras, emit-context, rule-emitter; then nested modules; then field-codegen + cycle break; finally slim driver).
6. `seal/` serialize decomposition + `seal.ts` extraction (typedef-normalizer, async-analysis, merge-inheritance).
7. Barrels/exports cleanup + `.d.ts` diff + deps:check/knip + benchmark.

Each phase is independently revertible; regressions isolate to one domain.

---

## Invariants (must hold every commit)
- `bunx tsc --noEmit` clean; `bun test` = 2340 pass.
- Generated `new Function` bodies byte-identical (codegen splits move code verbatim).
- Public surface (`/index.ts` names + 4 subpath barrels + `package.json` exports) unchanged,
  except the additive enum exports already shipped and any intentional fix documented here.
- `verbatimModuleSyntax` respected (enums plain-imported, types `import type`).
- No new dependency cycles (`deps:check`), no unused exports (`knip`).
