import type { EmittableRule, EmitContext, InternalRule } from './types';
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
  requiresType?: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object';
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
  const validate = typeof nameOrOptions === 'string' ? validateFn! : nameOrOptions.validate;
  const constraints = typeof nameOrOptions === 'object' ? nameOrOptions.constraints : undefined;
  const requiresType = typeof nameOrOptions === 'object' ? nameOrOptions.requiresType : undefined;

  const isAsyncFn = isAsyncFunction(validate);

  // Validation function wrapper — enforces that sync rules stay sync.
  const fn = function (value: unknown): boolean | Promise<boolean> {
    const result = validate(value);
    if (!isAsyncFn && isPromiseLike(result)) {
      throw new Error(`createRule(${name}): sync rule returned Promise. Declare the validator with async if it is asynchronous.`);
    }
    return result;
  } as InternalRule;

  // .emit() — generates function call code via the refs array
  fn.emit = function (varName: string, ctx: EmitContext): string {
    const i = ctx.addRef(fn);
    return `if(!(${isAsyncFn ? 'await ' : ''}_refs[${i}](${varName}))) ${ctx.fail(name)};`;
  };

  (fn as any).ruleName = name;
  (fn as any).isAsync = isAsyncFn;
  if (constraints) (fn as any).constraints = constraints;
  if (requiresType) (fn as any).requiresType = requiresType;

  return fn;
}
