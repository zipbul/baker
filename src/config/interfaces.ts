// ─────────────────────────────────────────────────────────────────────────────
// BakerConfig — per-Baker configuration (passed to `new Baker(config)`)
// ─────────────────────────────────────────────────────────────────────────────

export interface BakerConfig {
  /** Automatic type conversion ("123" → 123). @default false */
  autoConvert?: boolean;
  /** Use class default values when key is missing from input. @default false */
  allowClassDefaults?: boolean;
  /** Stop at first error. @default false */
  stopAtFirstError?: boolean;
  /** Reject undeclared fields with an error. @default false */
  forbidUnknown?: boolean;
  /** Include field exclusion reasons as comments in generated code. @default false */
  debug?: boolean;
}
