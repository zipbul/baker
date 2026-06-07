import type { EmittableRule } from '../types';

import { CacheKey, RequiredType, RuleOp } from '../enums';
import { makePlannedRule, planCompare, planLiteral, planOr, planTime } from '../rule-plan';

// ─────────────────────────────────────────────────────────────────────────────
// minDate — v >= date (inclusive, getTime comparison). (§4.8 C — refs function call)
// ─────────────────────────────────────────────────────────────────────────────

export function minDate(date: Date): EmittableRule {
  const timestamp = date.getTime();
  const plan = {
    cacheKey: CacheKey.Time,
    failure: planOr(planCompare(planTime(), RuleOp.Neq, planTime()), planCompare(planTime(), RuleOp.Lt, planLiteral(timestamp))),
  } as const;
  return makePlannedRule({
    name: 'minDate',
    requiresType: RequiredType.Date,
    constraints: { min: date.toISOString() },
    plan,
    validate: value => value instanceof Date && value.getTime() >= timestamp,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// maxDate — v <= date (inclusive, getTime comparison). (§4.8 C — refs function call)
// ─────────────────────────────────────────────────────────────────────────────

export function maxDate(date: Date): EmittableRule {
  const timestamp = date.getTime();
  const plan = {
    cacheKey: CacheKey.Time,
    failure: planOr(planCompare(planTime(), RuleOp.Neq, planTime()), planCompare(planTime(), RuleOp.Gt, planLiteral(timestamp))),
  } as const;
  return makePlannedRule({
    name: 'maxDate',
    requiresType: RequiredType.Date,
    constraints: { max: date.toISOString() },
    plan,
    validate: value => value instanceof Date && value.getTime() <= timestamp,
  });
}
