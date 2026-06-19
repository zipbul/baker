// Re-export shim — enums moved to their owning domains (Phase C1). Importers repointed in C1b.
export { Direction, CacheKey } from './common/enums';
export { ExcludeMode } from './decorators/enums';
export { RequiredType, RuleOp, RulePlanExprKind, RulePlanCheckKind } from './rules/enums';
export { CollectionType } from './metadata/enums';
