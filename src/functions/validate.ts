import { _toBakerErrors } from '../errors';
import { _ensureSealed } from '../seal/seal';
import type { BakerError, BakerErrors } from '../errors';
import type { EmittableRule } from '../types';
import type { RuntimeOptions } from '../interfaces';

// ─────────────────────────────────────────────────────────────────────────────
// validate — Public API (§5.3)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * DTO-level validation — validates input against a decorated class.
 * Sync DTOs return directly; async DTOs return Promise.
 */
export function validate<T>(
  Class: new (...args: any[]) => T,
  input: unknown,
  options?: RuntimeOptions,
): true | BakerErrors;
export function validate<T>(
  Class: new (...args: any[]) => T,
  input: unknown,
  options?: RuntimeOptions,
): Promise<true | BakerErrors>;

/**
 * Ad-hoc validation — validates a single value against one or more rules.
 * Sync rules return directly; async rules return Promise.
 */
export function validate(
  input: unknown,
  ...rules: EmittableRule[]
): true | BakerErrors;
export function validate(
  input: unknown,
  ...rules: EmittableRule[]
): Promise<true | BakerErrors>;

export function validate(
  classOrInput: unknown,
  ...rest: unknown[]
): true | BakerErrors | Promise<true | BakerErrors> {
  // ── DTO mode: validate(Class, input, options?) ────────────────────────
  if (typeof classOrInput === 'function' && rest.length >= 1) {
    const secondArg = rest[0];
    const isRule = secondArg != null && typeof secondArg === 'function' && 'emit' in secondArg && 'ruleName' in secondArg;
    if (!isRule) {
      const sealed = _ensureSealed(classOrInput);
      const options = rest[1] as RuntimeOptions | undefined;
      if (sealed._isAsync) {
        return (sealed._validate(secondArg, options) as Promise<BakerError[] | null>).then(
          (result): true | BakerErrors => result === null ? true : _toBakerErrors(result),
        );
      }
      const result = sealed._validate(secondArg, options) as BakerError[] | null;
      return result === null ? true : _toBakerErrors(result);
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
  if (rules.length === 0) return true;
  const hasAsync = rules.some(r => r.isAsync);

  if (hasAsync) {
    return _validateAdHocAsync(input, rules);
  }

  if (rules.length === 1) {
    const rule = rules[0]!;
    return rule(input) ? true : _toBakerErrors([{ path: '', code: rule.ruleName }]);
  }

  if (rules.length === 2) {
    const first = rules[0]!;
    const second = rules[1]!;
    const firstOk = first(input);
    const secondOk = second(input);
    if (firstOk && secondOk) return true;
    const errors: BakerError[] = [];
    if (!firstOk) errors.push({ path: '', code: first.ruleName });
    if (!secondOk) errors.push({ path: '', code: second.ruleName });
    return _toBakerErrors(errors);
  }

  if (rules.length === 3) {
    const first = rules[0]!;
    const second = rules[1]!;
    const third = rules[2]!;
    const firstOk = first(input);
    const secondOk = second(input);
    const thirdOk = third(input);
    if (firstOk && secondOk && thirdOk) return true;
    const errors: BakerError[] = [];
    if (!firstOk) errors.push({ path: '', code: first.ruleName });
    if (!secondOk) errors.push({ path: '', code: second.ruleName });
    if (!thirdOk) errors.push({ path: '', code: third.ruleName });
    return _toBakerErrors(errors);
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
