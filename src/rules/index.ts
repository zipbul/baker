// Directory barrel — the FULL internal surface other domains import via `../rules`.
// The published `./rules` subpath points at `./public` (curated public surface) instead, so these
// internal re-exports (EmitContext / InternalRule / emitRulePlan) never leak into the public API.

export * from './public';

// Internal surface — consumed cross-domain but NOT part of the published `./rules`.
export { createRule } from './create-rule';
export { emitRulePlan } from './rule-plan';
export { RequiredType } from './enums';
export type { EmittableRule, InternalRule, EmitContext } from './interfaces';
