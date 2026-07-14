import type { EmitContext, EmittableRule } from './interfaces';

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
): EmittableRule<string> {
  return makeRule<string>({
    name,
    requiresType,
    constraints,
    validate: value => typeof value === 'string' && validate(value),
    emit: buildEmit,
  });
}

/**
 * A string rule whose entire check is a single `RegExp.test()` — the ~20+ copy-pasted "register the
 * regex, fail if it doesn't match" string rules across the string-* modules collapse to one call each.
 * `re` may be computed per call (a locale-selected or option-built pattern), not just a module-level
 * constant. Sites with more than one regex (OR'd alternatives, or an extra non-regex guard) keep their
 * own `makeStringRule`/`makeRule` — this only covers the single-regex-test-then-fail shape.
 */
export function makeRegexRule(
  name: string,
  re: RegExp,
  requiresType?: RequiredType,
  constraints?: Record<string, unknown>,
): EmittableRule<string> {
  return makeStringRule(
    name,
    v => re.test(v),
    (varName, ctx) => {
      const i = ctx.addRegex(re);
      return `if (!re[${i}].test(${varName})) ${ctx.fail(name)};`;
    },
    requiresType,
    constraints,
  );
}
