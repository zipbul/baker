// ─────────────────────────────────────────────────────────────────────────────
// Enums local to the seal/ codegen layer.
// String-valued so generated-code branching stays identical.
// ─────────────────────────────────────────────────────────────────────────────

/** Null/undefined guard strategy selected per field from its optional/nullable flags. */
export enum GuardKey {
  NullableOptional = 'nullable+optional',
  Nullable = 'nullable',
  Optional = 'optional',
  Default = 'default',
}
