import type { EmittableRule } from './interfaces';

import { CacheKey } from '../common';
import { RequiredType, RuleOp } from './enums';
import { makePlannedRule, planCompare, planLiteral, planOr, planTime } from './rule-plan';

// ─────────────────────────────────────────────────────────────────────────────
// minDate — v >= date (inclusive, getTime comparison). (refs function call)
// ─────────────────────────────────────────────────────────────────────────────

export function minDate(date: Date): EmittableRule<Date> {
  const timestamp = date.getTime();
  const plan = {
    cacheKey: CacheKey.Time,
    failure: planOr(planCompare(planTime(), RuleOp.Neq, planTime()), planCompare(planTime(), RuleOp.Lt, planLiteral(timestamp))),
  } as const;
  return makePlannedRule<Date>({
    name: 'minDate',
    requiresType: RequiredType.Date,
    constraints: { min: date.toISOString() },
    plan,
    validate: value => value instanceof Date && value.getTime() >= timestamp,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// maxDate — v <= date (inclusive, getTime comparison). (refs function call)
// ─────────────────────────────────────────────────────────────────────────────

export function maxDate(date: Date): EmittableRule<Date> {
  const timestamp = date.getTime();
  const plan = {
    cacheKey: CacheKey.Time,
    failure: planOr(planCompare(planTime(), RuleOp.Neq, planTime()), planCompare(planTime(), RuleOp.Gt, planLiteral(timestamp))),
  } as const;
  return makePlannedRule<Date>({
    name: 'maxDate',
    requiresType: RequiredType.Date,
    constraints: { max: date.toISOString() },
    plan,
    validate: value => value instanceof Date && value.getTime() <= timestamp,
  });
}
