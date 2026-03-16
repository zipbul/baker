import type { EmittableRule, EmitContext } from './types';
import { isAsyncFunction } from './utils';

// ─────────────────────────────────────────────────────────────────────────────
// createRule — Custom validation rule creation Public API (§1.1)
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateRuleOptions {
  /** Rule name. Used as the error code. */
  name: string;
  /** Validation function — true: pass, false: fail. Async functions allowed (automatically registered as async rule when returning Promise<boolean>). */
  validate: (value: unknown) => boolean | Promise<boolean>;
  /** Rule parameters — used for toJsonSchema mapping */
  constraints?: Record<string, unknown>;
  /** Type assumed by this rule — used for type gate optimization */
  requiresType?: 'string' | 'number' | 'boolean' | 'date';
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

  // Auto-detect whether the function is async
  const isAsyncFn = isAsyncFunction(validate);

  // Validation function wrapper — delegates directly to validate
  const fn = function (value: unknown): boolean | Promise<boolean> {
    return validate(value);
  } as EmittableRule;

  // .emit() — generates function call code via the refs array
  fn.emit = function (varName: string, ctx: EmitContext): string {
    const i = ctx.addRef(validate);
    if (isAsyncFn) {
      return `if(!(await _refs[${i}](${varName}))) ${ctx.fail(name)};`;
    }
    return `if(!_refs[${i}](${varName})) ${ctx.fail(name)};`;
  };

  (fn as any).ruleName = name;
  (fn as any).isAsync = isAsyncFn;
  if (constraints) (fn as any).constraints = constraints;
  if (requiresType) (fn as any).requiresType = requiresType;

  return fn;
}
