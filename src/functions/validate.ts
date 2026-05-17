import type { BakerError, BakerErrors } from '../errors';
import type { RuntimeOptions } from '../interfaces';
import type { EmittableRule } from '../types';

import { toBakerErrors, SealError } from '../errors';
import { ensureSealed } from '../seal/seal';
import { checkCallOptions } from './check-call-options';

// ─────────────────────────────────────────────────────────────────────────────
// validate — Public API (§5.3)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * DTO-level validation — validates input against a decorated class.
 * Sync DTOs return directly; async DTOs return Promise.
 */
function validate<T>(
  Class: new (...args: never[]) => T,
  input: unknown,
  options?: RuntimeOptions,
): true | BakerErrors | Promise<true | BakerErrors>;

/**
 * Ad-hoc validation — validates a single value against one or more rules.
 * Sync rules return directly; async rules return Promise.
 */
function validate(input: unknown, ...rules: EmittableRule[]): true | BakerErrors | Promise<true | BakerErrors>;

function validate(classOrInput: unknown, ...rest: unknown[]): true | BakerErrors | Promise<true | BakerErrors> {
  // ── DTO mode: validate(Class, input, options?) ────────────────────────
  if (typeof classOrInput === 'function' && rest.length >= 1) {
    const secondArg = rest[0];
    const isRule = secondArg != null && typeof secondArg === 'function' && 'emit' in secondArg && 'ruleName' in secondArg;
    if (!isRule) {
      const checkedOpts = checkCallOptions(rest[1]);
      const sealed = ensureSealed(classOrInput);
      if (sealed.isAsync) {
        return (sealed.validate(secondArg, checkedOpts) as Promise<BakerError[] | null>).then((result): true | BakerErrors =>
          result === null ? true : toBakerErrors(result),
        );
      }
      const result = sealed.validate(secondArg, checkedOpts) as BakerError[] | null;
      return result === null ? true : toBakerErrors(result);
    }
  }

  // ── Ad-hoc mode: validate(input, ...rules) ───────────────────────────
  // W5 (D4): validate each rest arg is a baker rule
  for (let i = 0; i < rest.length; i++) {
    const r = rest[i];
    if (
      r == null ||
      typeof r !== 'function' ||
      typeof (r as { emit?: unknown }).emit !== 'function' ||
      typeof (r as { ruleName?: unknown }).ruleName !== 'string'
    ) {
      throw new SealError(
        `validate(input, ...rules): argument ${i + 1} is not a baker rule (got ${r === null ? 'null' : typeof r}). Use createRule() or import a rule from @zipbul/baker/rules.`,
      );
    }
  }
  return validateAdHoc(classOrInput, rest as EmittableRule[]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Ad-hoc validation
// ─────────────────────────────────────────────────────────────────────────────

function validateAdHoc(input: unknown, rules: EmittableRule[]): true | BakerErrors | Promise<true | BakerErrors> {
  if (rules.length === 0) {return true;}
  const hasAsync = rules.some(r => r.isAsync);

  if (hasAsync) {
    return validateAdHocAsync(input, rules);
  }

  if (rules.length === 1) {
    const rule = rules[0]!;
    return rule(input) ? true : toBakerErrors([{ path: '', code: rule.ruleName }]);
  }

  if (rules.length === 2) {
    const first = rules[0]!;
    const second = rules[1]!;
    const firstOk = first(input);
    const secondOk = second(input);
    if (firstOk && secondOk) {return true;}
    const errors: BakerError[] = [];
    if (!firstOk) {errors.push({ path: '', code: first.ruleName });}
    if (!secondOk) {errors.push({ path: '', code: second.ruleName });}
    return toBakerErrors(errors);
  }

  if (rules.length === 3) {
    const first = rules[0]!;
    const second = rules[1]!;
    const third = rules[2]!;
    const firstOk = first(input);
    const secondOk = second(input);
    const thirdOk = third(input);
    if (firstOk && secondOk && thirdOk) {return true;}
    const errors: BakerError[] = [];
    if (!firstOk) {errors.push({ path: '', code: first.ruleName });}
    if (!secondOk) {errors.push({ path: '', code: second.ruleName });}
    if (!thirdOk) {errors.push({ path: '', code: third.ruleName });}
    return toBakerErrors(errors);
  }

  const errors: BakerError[] = [];
  for (const rule of rules) {
    if (!rule(input)) {
      errors.push({ path: '', code: rule.ruleName });
    }
  }
  return errors.length ? toBakerErrors(errors) : true;
}

async function validateAdHocAsync(input: unknown, rules: EmittableRule[]): Promise<true | BakerErrors> {
  const errors: BakerError[] = [];
  for (const rule of rules) {
    const result = await rule(input);
    if (!result) {
      errors.push({ path: '', code: rule.ruleName });
    }
  }
  return errors.length ? toBakerErrors(errors) : true;
}

// ─────────────────────────────────────────────────────────────────────────────
// W14: strict sync/async variants — explicit intent at call site
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sync-asserted validate. Throws `SealError` if Class has any async rule/transform
 * on the deserialize/validate side. Use when caller code assumes sync return.
 */
function validateSync<T>(Class: new (...args: never[]) => T, input: unknown, options?: RuntimeOptions): true | BakerErrors {
  const checkedOpts = checkCallOptions(options);
  const sealed = ensureSealed(Class);
  if (sealed.isAsync) {
    throw new SealError(`validateSync(${Class.name}): DTO has async rules/transforms. Use validateAsync() instead.`);
  }
  const result = sealed.validate(input, checkedOpts) as BakerError[] | null;
  return result === null ? true : toBakerErrors(result);
}

/**
 * Async-asserted validate. Always returns Promise (sync DTOs are wrapped via Promise.resolve).
 */
function validateAsync<T>(
  Class: new (...args: never[]) => T,
  input: unknown,
  options?: RuntimeOptions,
): Promise<true | BakerErrors> {
  const checkedOpts = checkCallOptions(options);
  const sealed = ensureSealed(Class);
  if (sealed.isAsync) {
    return (sealed.validate(input, checkedOpts) as Promise<BakerError[] | null>).then((r): true | BakerErrors =>
      r === null ? true : toBakerErrors(r),
    );
  }
  const result = sealed.validate(input, checkedOpts) as BakerError[] | null;
  return Promise.resolve(result === null ? true : toBakerErrors(result));
}
export { validate, validateSync, validateAsync };
