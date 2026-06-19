// Re-export shim — declarations moved to their owning domains (Phase C1). Importers will be
// repointed off this shim in C1b; this file is then deleted.
export type { ClassCtor } from './common/types';
export type { EmitContext, EmittableRule, InternalRule, RulePlan, RulePlanCheck, RulePlanExpr } from './rules/types';
export type { MessageArgs, RuleDef, TransformDef, ExposeDef, ExcludeDef, TypeDef, PropertyFlags, RawClassMeta, RawPropertyMeta } from './metadata/types';
export type { Transformer, TransformParams, TransformFunction } from './transformers/types';
export type { SealedExecutors } from './seal/types';
