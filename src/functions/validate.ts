import { _runSealed } from './_run-sealed';
import { _toBakerErrors } from '../errors';
import type { BakerError, BakerErrors } from '../errors';
import type { EmittableRule } from '../types';
import type { RuntimeOptions } from '../interfaces';

// ─────────────────────────────────────────────────────────────────────────────
// validate — Public API (§5.3)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * DTO-level validation — validates input against a decorated class.
 * Sync DTOs return directly, async DTOs return Promise.
 */
export function validate<T>(
  Class: new (...args: any[]) => T,
  input: unknown,
  options?: RuntimeOptions,
): true | BakerErrors | Promise<true | BakerErrors>;

/**
 * Ad-hoc validation — validates a single value against one or more rules.
 * Sync rules return directly, async rules return Promise.
 */
export function validate(
  input: unknown,
  ...rules: EmittableRule[]
): true | BakerErrors | Promise<true | BakerErrors>;

export function validate(
  classOrInput: unknown,
  ...rest: unknown[]
): true | BakerErrors | Promise<true | BakerErrors> {
  // ── DTO mode: validate(Class, input, options?) ────────────────────────
  if (typeof classOrInput === 'function' && rest.length >= 1) {
    const secondArg = rest[0];
    const isRule = secondArg != null && typeof secondArg === 'function' && 'emit' in secondArg && 'ruleName' in secondArg;
    if (!isRule) {
      return _runSealed(
        classOrInput as Function,
        secondArg,
        rest[1] as RuntimeOptions | undefined,
        () => true as const,
      );
    }
  }

  // ── Ad-hoc mode: validate(input, ...rules) ───────────────────────────
  return _validateAdHoc(classOrInput, rest as EmittableRule[]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Ad-hoc validation
// ─────────────────────────────────────────────────────────────────────────────

function _validateAdHoc(
  input: unknown,
  rules: EmittableRule[],
): true | BakerErrors | Promise<true | BakerErrors> {
  const hasAsync = rules.some(r => r.isAsync);

  if (hasAsync) {
    return _validateAdHocAsync(input, rules);
  }

  const errors: BakerError[] = [];
  for (const rule of rules) {
    if (!rule(input)) {
      errors.push({ path: '', code: rule.ruleName });
    }
  }
  return errors.length ? _toBakerErrors(errors) : true;
}

async function _validateAdHocAsync(
  input: unknown,
  rules: EmittableRule[],
): Promise<true | BakerErrors> {
  const errors: BakerError[] = [];
  for (const rule of rules) {
    const result = await rule(input);
    if (!result) {
      errors.push({ path: '', code: rule.ruleName });
    }
  }
  return errors.length ? _toBakerErrors(errors) : true;
}
