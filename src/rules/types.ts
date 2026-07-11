import type { RuleOp, RulePlanCheckKind, RulePlanExprKind } from './enums';

/** The field types the array/collection rules (arrayMinSize, arrayContains, …) validate — baker
 *  applies them to arrays, Sets, and Maps. */
export type CollectionValue = readonly unknown[] | ReadonlySet<unknown> | ReadonlyMap<unknown, unknown>;

/** Union of the value domains of a tuple of rules — the field domain an `oneOf(...)` accepts. */
export type UnionOfDomains<B extends readonly unknown[]> = {
  [K in keyof B]: B[K] extends { readonly __v?: infer V } ? V : never;
}[number];

/**
 * Widen a literal to its primitive domain (`'a'` → `string`, `5` → `number`, …). Used by value rules
 * (`equals`/`isIn`) so `equals('active')` types as `EmittableRule<string>` — it applies to a `string`
 * field or a literal-union field, while `equals(5)` on a `string` field still fails to compile.
 */
export type WidenLiteral<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T extends bigint
        ? bigint
        : T extends symbol
          ? symbol
          : T;

// Member/Call0 always operate on the field value itself (`value.length` / `value.getTime()`); there is
// no nested-object form, so the node carries only the operation descriptor — no recursive `object`.
export type RulePlanExpr =
  | { kind: RulePlanExprKind.Value }
  | { kind: RulePlanExprKind.Member; property: 'length' }
  | { kind: RulePlanExprKind.Call0; method: 'getTime' }
  | { kind: RulePlanExprKind.Literal; value: number };

export type RulePlanCheck =
  | { kind: RulePlanCheckKind.Compare; left: RulePlanExpr; op: RuleOp; right: RulePlanExpr }
  | { kind: RulePlanCheckKind.And | RulePlanCheckKind.Or; checks: RulePlanCheck[] };

// Accessor-cache the plan emit shares with its caller: when a field hoists `value.length` /
// `value.getTime()` into a local, the emitter reuses that local instead of re-reading. The seal
// builder constructs this and passes it to `emitRulePlan`, so the shape lives here as the contract.
export type RulePlanCache = {
  length?: string;
  time?: string;
};
