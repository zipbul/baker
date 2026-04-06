import type { EmitContext, EmittableRule } from '../types';
import { makePlannedRule, planCompare, planLiteral, planOr, planTime } from '../rule-plan';

// ─────────────────────────────────────────────────────────────────────────────
// minDate — v >= date (inclusive, getTime comparison). (§4.8 C — refs function call)
// ─────────────────────────────────────────────────────────────────────────────

export function minDate(date: Date): EmittableRule {
  const timestamp = date.getTime();
  const plan = {
    cacheKey: 'time',
    failure: planOr(
      planCompare(planTime(), '!==', planTime()),
      planCompare(planTime(), '<', planLiteral(timestamp)),
    ),
  } as const;
  return makePlannedRule({
    name: 'minDate',
    requiresType: 'date',
    constraints: { min: date.toISOString() },
    plan,
    validate: (value) => value instanceof Date && value.getTime() >= timestamp,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// maxDate — v <= date (inclusive, getTime comparison). (§4.8 C — refs function call)
// ─────────────────────────────────────────────────────────────────────────────

export function maxDate(date: Date): EmittableRule {
  const timestamp = date.getTime();
  const plan = {
    cacheKey: 'time',
    failure: planOr(
      planCompare(planTime(), '!==', planTime()),
      planCompare(planTime(), '>', planLiteral(timestamp)),
    ),
  } as const;
  return makePlannedRule({
    name: 'maxDate',
    requiresType: 'date',
    constraints: { max: date.toISOString() },
    plan,
    validate: (value) => value instanceof Date && value.getTime() <= timestamp,
  });
}
