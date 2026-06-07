import type { RequiredType } from './enums';
import type { EmittableRule, EmitContext, InternalRule } from './types';

import { BakerError } from './errors';
import { defineRuleMetadata } from './rule-metadata';
import { isAsyncFunction, isPromiseLike } from './utils';

// ─────────────────────────────────────────────────────────────────────────────
// createRule — Custom validation rule creation Public API (§1.1)
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateRuleOptions {
  /** Rule name. Used as the error code. */
  name: string;
  /** Validation function — true: pass, false: fail. Async functions allowed (automatically registered as async rule when returning Promise<boolean>). */
  validate: (value: unknown) => boolean | Promise<boolean>;
  /** Rule parameters */
  constraints?: Record<string, unknown>;
  /** Type assumed by this rule — used for type gate optimization */
  requiresType?: RequiredType;
}

/**
 * Creates a user-defined validation rule.
 *
 * @example
 * // Simple form
 * const koreanPhone = createRule('koreanPhone', (v) => /^01[016789]/.test(v as string));
 *
 * // Options form
 * const isEven = createRule({
 *   name: 'isEven',
 *   validate: (v) => typeof v === 'number' && v % 2 === 0,
 * });
 */
export function createRule(name: string, validate: (value: unknown) => boolean | Promise<boolean>): EmittableRule;
export function createRule(options: CreateRuleOptions): EmittableRule;
export function createRule(
  nameOrOptions: string | CreateRuleOptions,
  validateFn?: (value: unknown) => boolean | Promise<boolean>,
): EmittableRule {
  const name = typeof nameOrOptions === 'string' ? nameOrOptions : nameOrOptions.name;
  const validate = typeof nameOrOptions === 'string' ? validateFn : nameOrOptions.validate;
  // The overloads require `validate`; guard the untyped-JS path instead of asserting with `!`,
  // so misuse fails clearly at creation rather than as a confusing TypeError at validation time.
  if (typeof validate !== 'function') {
    throw new BakerError(`createRule(${name}): a validate function is required.`);
  }
  const constraints = typeof nameOrOptions === 'object' ? nameOrOptions.constraints : undefined;
  const requiresType = typeof nameOrOptions === 'object' ? nameOrOptions.requiresType : undefined;

  const isAsyncFn = isAsyncFunction(validate);

  // Validation function wrapper — enforces that sync rules stay sync.
  const fn = function (value: unknown): boolean | Promise<boolean> {
    const result = validate(value);
    if (!isAsyncFn && isPromiseLike(result)) {
      throw new BakerError(
        `createRule(${name}): sync rule returned Promise. Declare the validator with async if it is asynchronous.`,
      );
    }
    return result;
  } as InternalRule;

  // .emit() — generates function call code via the refs array
  fn.emit = function (varName: string, ctx: EmitContext): string {
    const i = ctx.addRef(fn);
    return `if(!(${isAsyncFn ? 'await ' : ''}refs[${i}](${varName}))) ${ctx.fail(name)};`;
  };

  const meta: Parameters<typeof defineRuleMetadata>[1] = {
    emit: fn.emit,
    ruleName: name,
    isAsync: isAsyncFn,
  };
  if (constraints !== undefined) {
    meta.constraints = constraints;
  }
  if (requiresType !== undefined) {
    meta.requiresType = requiresType;
  }
  defineRuleMetadata(fn, meta);

  return fn;
}
