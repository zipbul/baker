import type { RuleOp, RulePlanCheckKind, RulePlanExprKind } from './enums';

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
