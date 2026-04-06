import type { EmitContext, InternalRule, RulePlan, RulePlanCheck, RulePlanExpr } from './types';

type RulePlanCache = {
  length?: string;
  time?: string;
};

export const planValue = (): RulePlanExpr => ({ kind: 'value' });

export const planLength = (object: RulePlanExpr = planValue()): RulePlanExpr => ({
  kind: 'member',
  object,
  property: 'length',
});

export const planTime = (object: RulePlanExpr = planValue()): RulePlanExpr => ({
  kind: 'call0',
  object,
  method: 'getTime',
});

export const planLiteral = (value: number): RulePlanExpr => ({ kind: 'literal', value });

export const planCompare = (
  left: RulePlanExpr,
  op: '<' | '<=' | '>' | '>=' | '===' | '!==',
  right: number | RulePlanExpr,
): RulePlanCheck => ({
  kind: 'compare',
  left,
  op,
  right: typeof right === 'number' ? planLiteral(right) : right,
});

export const planAnd = (...checks: RulePlanCheck[]): RulePlanCheck => ({ kind: 'and', checks });

export const planOr = (...checks: RulePlanCheck[]): RulePlanCheck => ({ kind: 'or', checks });

export function makePlannedRule(options: {
  name: string;
  requiresType: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object';
  constraints?: Record<string, unknown>;
  plan: RulePlan;
  validate: (value: unknown) => boolean;
}): InternalRule {
  return makeRule({
    name: options.name,
    requiresType: options.requiresType,
    constraints: options.constraints,
    plan: options.plan,
    validate: options.validate,
    emit: (varName, ctx) => emitRulePlan(varName, ctx, options.name, options.plan),
  });
}

export function makeRule(options: {
  name: string;
  validate: (value: unknown) => boolean | Promise<boolean>;
  emit: (varName: string, ctx: EmitContext) => string;
  requiresType?: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object';
  constraints?: Record<string, unknown>;
  isAsync?: boolean;
  plan?: RulePlan;
}): InternalRule {
  const fn = ((value: unknown) => options.validate(value)) as InternalRule;
  (fn as any).emit = options.emit;
  (fn as any).ruleName = options.name;
  if (options.requiresType !== undefined) (fn as any).requiresType = options.requiresType;
  (fn as any).constraints = options.constraints ?? {};
  if (options.isAsync) (fn as any).isAsync = true;
  if (options.plan) (fn as any).plan = options.plan;
  return fn;
}

export function emitRulePlan(
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
  if (check.kind === 'compare') return check;
  const filtered = check.checks.filter(c => !isSelfComparison(c));
  if (filtered.length === 0) return check; // safety: don't strip everything
  if (filtered.length === 1) return filtered[0]!;
  return { kind: check.kind, checks: filtered };
}

function isSelfComparison(check: RulePlanCheck): boolean {
  if (check.kind !== 'compare' || check.op !== '!==') return false;
  return exprEqual(check.left, check.right);
}

function exprEqual(a: RulePlanExpr, b: RulePlanExpr): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'value') return true;
  if (a.kind === 'literal') return a.value === (b as typeof a).value;
  if (a.kind === 'member') return exprEqual(a.object, (b as typeof a).object);
  if (a.kind === 'call0') return a.method === (b as typeof a).method && exprEqual(a.object, (b as typeof a).object);
  return false;
}

function emitPlanCheck(
  check: RulePlanCheck,
  varName: string,
  cache?: RulePlanCache,
): string {
  if (check.kind === 'compare') {
    return `${emitPlanExpr(check.left, varName, cache)} ${check.op} ${emitPlanExpr(check.right, varName, cache)}`;
  }
  const joiner = check.kind === 'and' ? ' && ' : ' || ';
  return `(${check.checks.map(part => emitPlanCheck(part, varName, cache)).join(joiner)})`;
}

function emitPlanExpr(
  expr: RulePlanExpr,
  varName: string,
  cache?: RulePlanCache,
): string {
  switch (expr.kind) {
    case 'value':
      return varName;
    case 'literal':
      return String(expr.value);
    case 'member':
      return cache?.length ?? `${emitPlanExpr(expr.object, varName, cache)}.length`;
    case 'call0':
      return cache?.time ?? `${emitPlanExpr(expr.object, varName, cache)}.getTime()`;
  }
}
