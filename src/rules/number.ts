import type { EmitContext, EmittableRule } from '../types';
import { makePlannedRule, makeRule, planCompare, planLiteral, planOr, planValue } from '../rule-plan';

// ─────────────────────────────────────────────────────────────────────────────
// min — v >= n check. requiresType='number' (§4.7, §4.8 A)
// ─────────────────────────────────────────────────────────────────────────────

export function min(n: number, opts?: { exclusive?: boolean }): EmittableRule {
  if (!Number.isFinite(n)) throw new Error(`min: bound must be a finite number, got ${n}`);
  const exclusive = opts?.exclusive ?? false;
  const plan = {
    failure: planOr(
      planCompare(planValue(), '!==', planValue()),
      planCompare(planValue(), exclusive ? '<=' : '<', planLiteral(n)),
    ),
  } as const;
  return makePlannedRule({
    name: 'min',
    requiresType: 'number',
    constraints: exclusive ? { min: n, exclusive: true } : { min: n },
    plan,
    validate: exclusive
      ? (value) => typeof value === 'number' && !isNaN(value) && value > n
      : (value) => typeof value === 'number' && !isNaN(value) && value >= n,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// max — v <= n check. requiresType='number' (§4.7, §4.8 A)
// ─────────────────────────────────────────────────────────────────────────────

export function max(n: number, opts?: { exclusive?: boolean }): EmittableRule {
  if (!Number.isFinite(n)) throw new Error(`max: bound must be a finite number, got ${n}`);
  const exclusive = opts?.exclusive ?? false;
  const plan = {
    failure: planOr(
      planCompare(planValue(), '!==', planValue()),
      planCompare(planValue(), exclusive ? '>=' : '>', planLiteral(n)),
    ),
  } as const;
  return makePlannedRule({
    name: 'max',
    requiresType: 'number',
    constraints: exclusive ? { max: n, exclusive: true } : { max: n },
    plan,
    validate: exclusive
      ? (value) => typeof value === 'number' && !isNaN(value) && value < n
      : (value) => typeof value === 'number' && !isNaN(value) && value <= n,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// isPositive — v > 0 (0 not included). requiresType='number' (§4.8 A)
// ─────────────────────────────────────────────────────────────────────────────

export const isPositive = makePlannedRule({
  name: 'isPositive',
  requiresType: 'number',
  constraints: { min: 0, exclusive: true },
  plan: {
    failure: planOr(
      planCompare(planValue(), '!==', planValue()),
      planCompare(planValue(), '<=', planLiteral(0)),
    ),
  },
  validate: (value) => typeof value === 'number' && !isNaN(value) && value > 0,
});

// ─────────────────────────────────────────────────────────────────────────────
// isNegative — v < 0 (0 not included). requiresType='number' (§4.8 A)
// ─────────────────────────────────────────────────────────────────────────────

export const isNegative = makePlannedRule({
  name: 'isNegative',
  requiresType: 'number',
  constraints: { max: 0, exclusive: true },
  plan: {
    failure: planOr(
      planCompare(planValue(), '!==', planValue()),
      planCompare(planValue(), '>=', planLiteral(0)),
    ),
  },
  validate: (value) => typeof value === 'number' && !isNaN(value) && value < 0,
});

// ─────────────────────────────────────────────────────────────────────────────
// isDivisibleBy — v % n === 0 check. requiresType='number' (§4.8 A)
// ─────────────────────────────────────────────────────────────────────────────

export function isDivisibleBy(n: number): EmittableRule {
  if (n === 0) throw new Error('isDivisibleBy: divisor must not be zero');
  return makeRule({
    name: 'isDivisibleBy',
    requiresType: 'number',
    constraints: { divisor: n },
    validate: (value) => typeof value === 'number' && !isNaN(value) && value % n === 0,
    emit: (varName: string, ctx: EmitContext): string =>
      `if (${varName} % ${n} !== 0) ${ctx.fail('isDivisibleBy')};`,
  });
}
