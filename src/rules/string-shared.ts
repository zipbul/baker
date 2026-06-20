import type { EmitContext, EmittableRule } from './types';

import { RequiredType } from './enums';
import { makeRule } from './rule-plan';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function makeStringRule(
  name: string,
  validate: (v: string) => boolean,
  buildEmit: (varName: string, ctx: EmitContext) => string,
  requiresType: RequiredType | undefined = RequiredType.String,
  constraints: Record<string, unknown> = {},
): EmittableRule {
  return makeRule({
    name,
    requiresType,
    constraints,
    validate: value => typeof value === 'string' && validate(value),
    emit: buildEmit,
  });
}
