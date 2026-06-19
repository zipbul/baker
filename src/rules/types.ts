import type { CacheKey } from '../common/enums';
import type { SealedExecutors } from '../seal/types';
import type { RuleOp, RulePlanCheckKind, RulePlanExprKind, RequiredType } from './enums';

// ─────────────────────────────────────────────────────────────────────────────
// EmitContext — Code generation context (§4.7)
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
// EmittableRule — Validation function + .emit() (§4.7, §4.8)
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

export type RulePlanExpr =
  | { kind: RulePlanExprKind.Value }
  | { kind: RulePlanExprKind.Member; object: RulePlanExpr; property: 'length' }
  | { kind: RulePlanExprKind.Call0; object: RulePlanExpr; method: 'getTime' }
  | { kind: RulePlanExprKind.Literal; value: number };

export type RulePlanCheck =
  | { kind: RulePlanCheckKind.Compare; left: RulePlanExpr; op: RuleOp; right: RulePlanExpr }
  | { kind: RulePlanCheckKind.And | RulePlanCheckKind.Or; checks: RulePlanCheck[] };

export interface RulePlan {
  cacheKey?: CacheKey;
  failure: RulePlanCheck;
}
