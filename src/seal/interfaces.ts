// ─────────────────────────────────────────────────────────────────────────────
// SealOptions — seal-time options resolved from a Baker's config (§1.4)
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
