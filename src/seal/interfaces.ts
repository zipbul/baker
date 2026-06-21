import type { Result, ResultAsync } from '@zipbul/result';

import type { BakerIssue, RuntimeOptions } from '../common';
import type { RawClassMeta, RuleDef } from '../metadata';

// ─────────────────────────────────────────────────────────────────────────────
// SealOptions — seal-time options resolved from a Baker's config
// ─────────────────────────────────────────────────────────────────────────────

export interface SealOptions {
  /** Automatic conversion using validation decorators as type hints. @default false */
  enableImplicitConversion?: boolean;
  /** Use class default values when the key is missing from input. @default false */
  exposeDefaultValues?: boolean;
  /** true: return immediately on first error. false (default): collect all errors. @default false */
  stopAtFirstError?: boolean;
  /**
   * true: reject undeclared fields. Uses the key set from mergeInheritance(Class) as the allowlist.
   * `@Exclude` fields are also included in the whitelist — present but excluded from the result.
   * @default false
   */
  whitelist?: boolean;
  /** true: include field exclusion reasons as comments in generated code. @default false */
  debug?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// SealedExecutors — Dual executor stored in the Baker's per-instance executor map
// ─────────────────────────────────────────────────────────────────────────────

export interface SealedExecutors<T> {
  /** Internal executor — Result pattern. deserialize() wraps and converts to throw */
  deserialize(input: unknown, options?: RuntimeOptions): Result<T, BakerIssue[]> | ResultAsync<T, BakerIssue[]>;
  /** Internal executor — always succeeds. serialize assumes no validation */
  serialize(instance: T, options?: RuntimeOptions): Record<string, unknown> | Promise<Record<string, unknown>>;
  /** Internal executor — validate-only (no object creation). Returns null on success, BakerIssue[] on failure */
  validate(input: unknown, options?: RuntimeOptions): BakerIssue[] | null | Promise<BakerIssue[] | null>;
  /** true if the deserialize direction has async rules/transforms/nested */
  isAsync: boolean;
  /** true if the serialize direction has async transforms/nested */
  isSerializeAsync: boolean;
  /** Inheritance-resolved metadata — read during codegen to wire nested DTO fields and async analysis */
  merged?: RawClassMeta;
}

// ─────────────────────────────────────────────────────────────────────────────
// ChildScope — inline-nested scope a parent DeserializeBuilder hands to a child
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inline-nested scope a parent builder hands to a child: the shared mutable accumulator (reference
 * arrays + circular-tracking set) plus the child's own path/var/input expression overrides.
 */
export interface ChildScope {
  regexes: RegExp[];
  refs: unknown[];
  execs: SealedExecutors<unknown>[];
  inlineCounter: { n: number };
  inlineNestedClasses: Set<Function> | undefined;
  pathPrefix: string;
  varPrefix: string;
  inputExpr: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Deserialize codegen rule-shaping types — shared between deserialize-builder and
// deserialize-codegen. Only the rules-free ones live here; the EmitContext-coupled
// codegen types (GuardParams/TypeGateConfig) stay internal to deserialize-codegen.ts
// to keep this barrel-exported file free of any `rules` edge (rules → seal already
// exists via EmitContext.addExecutor, so a seal/interfaces → rules edge would cycle).
// ─────────────────────────────────────────────────────────────────────────────

/** Partitioned validation rules for a field — produced by categorizeRules. */
export interface CategorizedRules {
  each: RuleDef[];
  generalRules: RuleDef[];
  /** The single typed dependency group (if any) after conflict check */
  typedDeps: { type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object'; deps: RuleDef[] } | undefined;
}

/** Result of resolveTypeGate — effective gate type and related metadata. */
export interface ResolvedTypeGate {
  effectiveGateType: string | null;
  /** The typed dependency rules (from requiresType) */
  gateDeps: RuleDef[];
  /** Index of the type asserter within generalRules (-1 if none) */
  typeAsserterIdx: number;
  /** The type asserter rule def (if found) */
  typeAsserter: RuleDef | undefined;
  /** Whether conversion is enabled for this field */
  enableConversion: boolean;
  /** Whether this gate was inferred from asserter only (no typed deps) */
  asserterInferredGate: string | null;
  /** Whether this gate was inferred from @Type hint */
  typeHintGate: string | null;
}
