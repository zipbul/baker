// Rule-domain enums (string-valued; inlined in --production builds).

/** Type a rule assumes for its value — drives the builder's type gate, gate dedup, and autoConvert target. */
export enum RequiredType {
  String = 'string',
  Number = 'number',
  Boolean = 'boolean',
  Date = 'date',
  Array = 'array',
  Object = 'object',
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
