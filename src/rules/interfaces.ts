import type { CacheKey } from '../common';
// Single upward type-only edge `rules → seal`: EmitContext.addExecutor references the compiled
// executor type. `import type` is erased at compile time, so it adds no runtime dependency or cycle.
import type { SealedExecutors } from '../seal';
import type { RequiredType } from './enums';
import type { RulePlanCheck } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// EmitContext — Code generation context
// ─────────────────────────────────────────────────────────────────────────────

export interface EmitContext {
  /** Register a RegExp in the reference array, return its index */
  addRegex(re: RegExp): number;
  /** Register in the reference array, return its index — functions, arrays, Sets, primitives, etc. */
  addRef(value: unknown): number;
  /** Register a SealedExecutors object in the reference array — for nested @Type DTOs */
  addExecutor(executor: SealedExecutors<unknown>): number;
  /** Generate a failure code string from an error code — path is bound by the builder */
  fail(code: string): string;
  /** Whether error collection mode is enabled (= !stopAtFirstError) */
  collectErrors: boolean;
  /** Whether this emit runs inside a type gate (typeof/instanceof already verified) */
  insideTypeGate?: boolean;
  /** @internal Path expression for inline nested — used by makeRuleEmitCtx */
  pathExpr?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// EmittableRule — Validation function + .emit()
// ─────────────────────────────────────────────────────────────────────────────

export interface EmittableRule {
  (value: unknown): boolean | Promise<boolean>;
  emit(varName: string, ctx: EmitContext): string;
  readonly ruleName: string;
  /**
   * Meta for the builder to determine whether to insert a typeof guard.
   * Only set for rules that assume a specific type (e.g., isEmail → 'string').
   * `@IsString` itself is undefined (it includes its own typeof check).
   */
  readonly requiresType?: RequiredType;
  /** Expose rule parameters for external reading */
  readonly constraints?: Record<string, unknown>;
  /** true when the rule is explicitly async and must be awaited */
  readonly isAsync?: boolean;
}

/** @internal internal rule shape used by builders for optimization metadata */
export interface InternalRule extends EmittableRule {
  readonly plan?: RulePlan;
}

export interface RulePlan {
  cacheKey?: CacheKey;
  failure: RulePlanCheck;
}
