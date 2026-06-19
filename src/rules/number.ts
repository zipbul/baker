import type { EmitContext, EmittableRule } from './types';

import { RequiredType, RuleOp } from './enums';
import { BakerError } from '../common/errors';
import { makePlannedRule, makeRule, planCompare, planLiteral, planOr, planValue } from '../rule-plan';

// ─────────────────────────────────────────────────────────────────────────────
// min — v >= n check. requiresType='number' (§4.7, §4.8 A)
// ─────────────────────────────────────────────────────────────────────────────

export function min(n: number, opts?: { exclusive?: boolean }): EmittableRule {
  if (!Number.isFinite(n)) {
    throw new BakerError(`min: bound must be a finite number, got ${n}`);
  }
  const exclusive = opts?.exclusive ?? false;
  const plan = {
    failure: planOr(
      planCompare(planValue(), RuleOp.Neq, planValue()),
      planCompare(planValue(), exclusive ? RuleOp.Lte : RuleOp.Lt, planLiteral(n)),
    ),
  } as const;
  return makePlannedRule({
    name: 'min',
    requiresType: RequiredType.Number,
    constraints: exclusive ? { min: n, exclusive: true } : { min: n },
    plan,
    validate: exclusive ? value => typeof value === 'number' && value > n : value => typeof value === 'number' && value >= n,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// max — v <= n check. requiresType='number' (§4.7, §4.8 A)
// ─────────────────────────────────────────────────────────────────────────────

export function max(n: number, opts?: { exclusive?: boolean }): EmittableRule {
  if (!Number.isFinite(n)) {
    throw new BakerError(`max: bound must be a finite number, got ${n}`);
  }
  const exclusive = opts?.exclusive ?? false;
  const plan = {
    failure: planOr(
      planCompare(planValue(), RuleOp.Neq, planValue()),
      planCompare(planValue(), exclusive ? RuleOp.Gte : RuleOp.Gt, planLiteral(n)),
    ),
  } as const;
  return makePlannedRule({
    name: 'max',
    requiresType: RequiredType.Number,
    constraints: exclusive ? { max: n, exclusive: true } : { max: n },
    plan,
    validate: exclusive ? value => typeof value === 'number' && value < n : value => typeof value === 'number' && value <= n,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// isPositive — v > 0 (0 not included). requiresType='number' (§4.8 A)
// ─────────────────────────────────────────────────────────────────────────────

export const isPositive = makePlannedRule({
  name: 'isPositive',
  requiresType: RequiredType.Number,
  constraints: { min: 0, exclusive: true },
  plan: {
    failure: planOr(planCompare(planValue(), RuleOp.Neq, planValue()), planCompare(planValue(), RuleOp.Lte, planLiteral(0))),
  },
  validate: value => typeof value === 'number' && value > 0,
});

// ─────────────────────────────────────────────────────────────────────────────
// isNegative — v < 0 (0 not included). requiresType='number' (§4.8 A)
// ─────────────────────────────────────────────────────────────────────────────

export const isNegative = makePlannedRule({
  name: 'isNegative',
  requiresType: RequiredType.Number,
  constraints: { max: 0, exclusive: true },
  plan: {
    failure: planOr(planCompare(planValue(), RuleOp.Neq, planValue()), planCompare(planValue(), RuleOp.Gte, planLiteral(0))),
  },
  validate: value => typeof value === 'number' && value < 0,
});

// ─────────────────────────────────────────────────────────────────────────────
// isDivisibleBy — v % n === 0 check. requiresType='number' (§4.8 A)
// ─────────────────────────────────────────────────────────────────────────────

export function isDivisibleBy(n: number): EmittableRule {
  if (n === 0) {
    throw new BakerError('isDivisibleBy: divisor must not be zero');
  }
  return makeRule({
    name: 'isDivisibleBy',
    requiresType: RequiredType.Number,
    constraints: { divisor: n },
    validate: value => typeof value === 'number' && value % n === 0,
    emit: (varName: string, ctx: EmitContext): string => `if (${varName} % ${n} !== 0) ${ctx.fail('isDivisibleBy')};`,
  });
}
