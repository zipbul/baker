import type { RequiredType } from './enums';
import type { EmitContext, InternalRule, RulePlan } from './interfaces';
import type { RulePlanCheck, RulePlanExpr } from './types';

import { RuleOp, RulePlanCheckKind, RulePlanExprKind } from './enums';
import { defineRuleMetadata } from './rule-metadata';

type RulePlanCache = {
  length?: string;
  time?: string;
};

const planValue = (): RulePlanExpr => ({ kind: RulePlanExprKind.Value });

const planLength = (): RulePlanExpr => ({ kind: RulePlanExprKind.Member, property: 'length' });

const planTime = (): RulePlanExpr => ({ kind: RulePlanExprKind.Call0, method: 'getTime' });

const planLiteral = (value: number): RulePlanExpr => ({ kind: RulePlanExprKind.Literal, value });

const planCompare = (left: RulePlanExpr, op: RuleOp, right: number | RulePlanExpr): RulePlanCheck => ({
  kind: RulePlanCheckKind.Compare,
  left,
  op,
  right: typeof right === 'number' ? planLiteral(right) : right,
});

const planOr = (...checks: RulePlanCheck[]): RulePlanCheck => ({ kind: RulePlanCheckKind.Or, checks });

function makePlannedRule(options: {
  name: string;
  requiresType: RequiredType;
  constraints?: Record<string, unknown>;
  plan: RulePlan;
  validate: (value: unknown) => boolean;
}): InternalRule {
  const inner: Parameters<typeof makeRule>[0] = {
    name: options.name,
    requiresType: options.requiresType,
    plan: options.plan,
    validate: options.validate,
    emit: (varName, ctx) => emitRulePlan(varName, ctx, options.name, options.plan, undefined, ctx.insideTypeGate),
  };
  if (options.constraints !== undefined) {
    inner.constraints = options.constraints;
  }
  return makeRule(inner);
}

function makeRule(options: {
  name: string;
  validate: (value: unknown) => boolean | Promise<boolean>;
  emit: (varName: string, ctx: EmitContext) => string;
  requiresType?: RequiredType;
  constraints?: Record<string, unknown>;
  isAsync?: boolean;
  plan?: RulePlan;
}): InternalRule {
  const fn = ((value: unknown) => options.validate(value)) as InternalRule;
  const meta: Parameters<typeof defineRuleMetadata>[1] = {
    emit: options.emit,
    ruleName: options.name,
    constraints: options.constraints ?? {},
  };
  if (options.requiresType !== undefined) {
    meta.requiresType = options.requiresType;
  }
  if (options.isAsync !== undefined) {
    meta.isAsync = options.isAsync;
  }
  if (options.plan !== undefined) {
    meta.plan = options.plan;
  }
  defineRuleMetadata(fn, meta);
  return fn;
}

function emitRulePlan(
  varName: string,
  ctx: EmitContext,
  ruleName: string,
  plan: RulePlan,
  cache?: RulePlanCache,
  insideTypeGate?: boolean,
): string {
  const failure = insideTypeGate ? stripSelfComparison(plan.failure) : plan.failure;
  return `if (${emitPlanCheck(failure, varName, cache)}) ${ctx.fail(ruleName)};`;
}

/** Strip `x !== x` / `getTime() !== getTime()` self-comparison guards — redundant inside type gate */
function stripSelfComparison(check: RulePlanCheck): RulePlanCheck {
  if (check.kind === RulePlanCheckKind.Compare) {
    return check;
  }
  const filtered = check.checks.filter(c => !isSelfComparison(c));
  if (filtered.length === 0) {
    return check;
  } // safety: don't strip everything
  if (filtered.length === 1) {
    return filtered[0]!;
  }
  return { kind: check.kind, checks: filtered };
}

function isSelfComparison(check: RulePlanCheck): boolean {
  if (check.kind !== RulePlanCheckKind.Compare || check.op !== RuleOp.Neq) {
    return false;
  }
  return exprEqual(check.left, check.right);
}

function exprEqual(a: RulePlanExpr, b: RulePlanExpr): boolean {
  // Each `b.kind === …` check narrows `b` to the same member as `a` (no casts). Value/Member/Call0
  // carry no distinguishing data beyond `kind`, so kind-equality is full equality; only Literal compares a value.
  switch (a.kind) {
    case RulePlanExprKind.Value:
      return b.kind === RulePlanExprKind.Value;
    case RulePlanExprKind.Member:
      return b.kind === RulePlanExprKind.Member;
    case RulePlanExprKind.Call0:
      return b.kind === RulePlanExprKind.Call0;
    case RulePlanExprKind.Literal:
      return b.kind === RulePlanExprKind.Literal && a.value === b.value;
    default:
      // Compile-time exhaustiveness: adding a RulePlanExpr.kind without a case fails to compile here.
      return a satisfies never;
  }
}

function emitPlanCheck(check: RulePlanCheck, varName: string, cache?: RulePlanCache): string {
  if (check.kind === RulePlanCheckKind.Compare) {
    return `${emitPlanExpr(check.left, varName, cache)} ${check.op} ${emitPlanExpr(check.right, varName, cache)}`;
  }
  const joiner = check.kind === RulePlanCheckKind.And ? ' && ' : ' || ';
  return `(${check.checks.map(part => emitPlanCheck(part, varName, cache)).join(joiner)})`;
}

function emitPlanExpr(expr: RulePlanExpr, varName: string, cache?: RulePlanCache): string {
  switch (expr.kind) {
    case RulePlanExprKind.Value:
      return varName;
    case RulePlanExprKind.Literal:
      return String(expr.value);
    case RulePlanExprKind.Member:
      return cache?.length ?? `${varName}.length`;
    case RulePlanExprKind.Call0:
      return cache?.time ?? `${varName}.getTime()`;
    default:
      // Compile-time exhaustiveness: adding a RulePlanExpr.kind without a case fails to compile here.
      return expr satisfies never;
  }
}
export { planValue, planLength, planTime, planLiteral, planCompare, planOr, makePlannedRule, makeRule, emitRulePlan };
