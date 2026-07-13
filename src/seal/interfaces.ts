import type { BakerIssue, RuntimeOptions } from '../common';
import type { CollectionType, RawClassMeta, RuleDef } from '../metadata';
import type { DeserializeOutcome } from './types';

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

// NOTE: deserialize/serialize/validate are declared with METHOD syntax (not arrow-property aliases)
// on purpose — methods are bivariant in their parameters, which is what lets a concrete
// `SealedExecutors<SomeDto>` be stored as `SealedExecutors<unknown>` (the type used throughout the
// executor maps and `execs[]`). Switching to the `DeserializeExecutor`/`ValidateExecutor` aliases
// (arrow types) would make the parameters contravariant and break that upcast.
export interface SealedExecutors<T> {
  /** Internal executor — array-sentinel pattern (see {@link DeserializeOutcome}). deserialize() wraps and converts to throw */
  deserialize(input: unknown, options?: RuntimeOptions): DeserializeOutcome<T>;
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
// ClassifiedType — result of reading a `@Type`/`@Field` type thunk's return value
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classification of a `@Type`/`@Field` `type` thunk's return value. The single reading of the
 * Map/Set marker + array-unwrap that seal normalization, circular analysis, and async analysis all
 * share — each caller then applies its OWN primitive-exclusion and error policy to `resolved` (seal
 * throws on a non-constructor; the analyzers skip it), so only the classification lives here.
 */
export interface ClassifiedType {
  /** Set when the thunk returned the `Map` or `Set` constructor (a collection field). */
  collection?: CollectionType;
  /** True when the thunk returned the array form `[Element]`. */
  isArray: boolean;
  /** The element value (array-unwrapped), or `undefined` for a Map/Set collection. */
  resolved: unknown;
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
