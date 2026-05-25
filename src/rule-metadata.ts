import type { EmittableRule, InternalRule, RulePlan } from './types';

// Type boundary — the single place that brands a bare validator function with
// the readonly metadata properties declared on InternalRule. All other modules
// produce InternalRule via this helper rather than reaching through `as unknown as`.
interface RuleMetadata {
  emit: EmittableRule['emit'];
  ruleName: string;
  requiresType?: EmittableRule['requiresType'];
  constraints?: Record<string, unknown>;
  isAsync?: boolean;
  plan?: RulePlan;
}

export function defineRuleMetadata(fn: InternalRule, meta: RuleMetadata): void {
  type MutableRule = {
    -readonly [K in keyof InternalRule]: InternalRule[K];
  };
  const target = fn as MutableRule;
  target.emit = meta.emit;
  target.ruleName = meta.ruleName;
  if (meta.requiresType !== undefined) {
    target.requiresType = meta.requiresType;
  }
  if (meta.constraints !== undefined) {
    target.constraints = meta.constraints;
  }
  if (meta.isAsync !== undefined) {
    target.isAsync = meta.isAsync;
  }
  if (meta.plan) {
    target.plan = meta.plan;
  }
}
