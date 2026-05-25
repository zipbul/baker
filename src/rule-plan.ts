import type { EmitContext, InternalRule, RulePlan, RulePlanCheck, RulePlanExpr } from './types';

import { defineRuleMetadata } from './rule-metadata';

type RulePlanCache = {
  length?: string;
  time?: string;
};

const planValue = (): RulePlanExpr => ({ kind: 'value' });

const planLength = (object: RulePlanExpr = planValue()): RulePlanExpr => ({
  kind: 'member',
  object,
  property: 'length',
});

const planTime = (object: RulePlanExpr = planValue()): RulePlanExpr => ({
  kind: 'call0',
  object,
  method: 'getTime',
});

const planLiteral = (value: number): RulePlanExpr => ({ kind: 'literal', value });

const planCompare = (
  left: RulePlanExpr,
  op: '<' | '<=' | '>' | '>=' | '===' | '!==',
  right: number | RulePlanExpr,
): RulePlanCheck => ({
  kind: 'compare',
  left,
  op,
  right: typeof right === 'number' ? planLiteral(right) : right,
});

const planOr = (...checks: RulePlanCheck[]): RulePlanCheck => ({ kind: 'or', checks });

function makePlannedRule(options: {
  name: string;
  requiresType: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object';
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
  requiresType?: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object';
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
  if (check.kind === 'compare') {
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
  if (check.kind !== 'compare' || check.op !== '!==') {
    return false;
  }
  return exprEqual(check.left, check.right);
}

function exprEqual(a: RulePlanExpr, b: RulePlanExpr): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  switch (a.kind) {
    case 'value':
      return true;
    case 'literal':
      return a.value === (b as typeof a).value;
    case 'member':
      return exprEqual(a.object, (b as typeof a).object);
    case 'call0':
      return a.method === (b as typeof a).method && exprEqual(a.object, (b as typeof a).object);
    default:
      // Compile-time exhaustiveness: adding a RulePlanExpr.kind without a case fails to compile here.
      return a satisfies never;
  }
}

function emitPlanCheck(check: RulePlanCheck, varName: string, cache?: RulePlanCache): string {
  if (check.kind === 'compare') {
    return `${emitPlanExpr(check.left, varName, cache)} ${check.op} ${emitPlanExpr(check.right, varName, cache)}`;
  }
  const joiner = check.kind === 'and' ? ' && ' : ' || ';
  return `(${check.checks.map(part => emitPlanCheck(part, varName, cache)).join(joiner)})`;
}

function emitPlanExpr(expr: RulePlanExpr, varName: string, cache?: RulePlanCache): string {
  switch (expr.kind) {
    case 'value':
      return varName;
    case 'literal':
      return String(expr.value);
    case 'member':
      return cache?.length ?? `${emitPlanExpr(expr.object, varName, cache)}.length`;
    case 'call0':
      return cache?.time ?? `${emitPlanExpr(expr.object, varName, cache)}.getTime()`;
    default:
      // Compile-time exhaustiveness: adding a RulePlanExpr.kind without a case fails to compile here.
      return expr satisfies never;
  }
}
export { planValue, planLength, planTime, planLiteral, planCompare, planOr, makePlannedRule, makeRule, emitRulePlan };
