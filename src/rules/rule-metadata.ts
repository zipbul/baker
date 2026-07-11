import type { EmittableRule, InternalRule, RulePlan } from './interfaces';

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

/**
 * Deep-clone-and-freeze a rule's constraints for exposure on public `BakerIssue.constraints`. Plain
 * objects and arrays are cloned (so the rule owns its copy — mutating an issue cannot corrupt the
 * rule's own validation refs, e.g. `arrayContains`' `values`, and the caller's array passed to
 * `isIn`/`isEnum`/… is never frozen out from under them) and the clone is frozen. Non-plain values
 * (primitives, Date, RegExp, class instances, functions) are passed through by reference — rare in
 * constraints (e.g. `equals(someValue)`) and never a shared validation ref.
 */
function deepCloneFreeze(value: unknown): unknown {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(deepCloneFreeze));
  }
  if (value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      out[key] = deepCloneFreeze((value as Record<string, unknown>)[key]);
    }
    return Object.freeze(out);
  }
  return value;
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
    // Exposed on public BakerIssue.constraints as a shared reference across all calls; deep-clone-freeze
    // so a caller mutating an issue's constraints cannot corrupt the rule's validation refs.
    target.constraints = deepCloneFreeze(meta.constraints) as Record<string, unknown>;
  }
  if (meta.isAsync !== undefined) {
    target.isAsync = meta.isAsync;
  }
  if (meta.plan !== undefined) {
    target.plan = meta.plan;
  }
}
