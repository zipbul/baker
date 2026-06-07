// ─────────────────────────────────────────────────────────────────────────────
// Enums local to the seal/ codegen layer.
// String-valued so generated-code branching stays identical.
// ─────────────────────────────────────────────────────────────────────────────

/** Null/undefined guard strategy selected per field from its optional/nullable/defined flags. */
export enum GuardKey {
  NullableOptional = 'nullable+optional',
  Nullable = 'nullable',
  Defined = 'defined',
  Optional = 'optional',
  Default = 'default',
}
