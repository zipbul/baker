// ─────────────────────────────────────────────────────────────────────────────
// Enums — shared, cross-cutting literal sets.
//
// All enums are string-valued: their values are identical to the string literals
// they replace, so `===` comparisons, Record keys, and any value interpolated into
// generated code remain byte-identical. `--production` builds inline them.
// ─────────────────────────────────────────────────────────────────────────────

/** Type a rule assumes for its value — drives the builder's type gate, gate dedup, and autoConvert target. */
export enum RequiredType {
  String = 'string',
  Number = 'number',
  Boolean = 'boolean',
  Date = 'date',
  Array = 'array',
  Object = 'object',
}

/** Direction of a (de)serialization pass. */
export enum Direction {
  Deserialize = 'deserialize',
  Serialize = 'serialize',
}

/** Collection container type for a nested field. */
export enum CollectionType {
  Map = 'Map',
  Set = 'Set',
}

/** Cached accessor a RulePlan reuses across checks. */
export enum CacheKey {
  Length = 'length',
  Time = 'time',
}

/** Discriminant for a RulePlanExpr node. */
export enum RulePlanExprKind {
  Value = 'value',
  Member = 'member',
  Call0 = 'call0',
  Literal = 'literal',
}

/** Discriminant for a RulePlanCheck node. */
export enum RulePlanCheckKind {
  Compare = 'compare',
  And = 'and',
  Or = 'or',
}

/** Comparison operator emitted into generated check code. */
export enum RuleOp {
  Lt = '<',
  Lte = '<=',
  Gt = '>',
  Gte = '>=',
  Eq = '===',
  Neq = '!==',
}

/** Direction in which a field is excluded. */
export enum ExcludeMode {
  DeserializeOnly = 'deserializeOnly',
  SerializeOnly = 'serializeOnly',
}
