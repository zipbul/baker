import type { EmitContext, EmittableRule } from './interfaces';

import { makeRule } from './rule-plan';

// ─────────────────────────────────────────────────────────────────────────────
// equals — strict equality (===). comparison value passed via refs
// ─────────────────────────────────────────────────────────────────────────────

export function equals(comparison: unknown): EmittableRule {
  return makeRule({
    name: 'equals',
    constraints: { value: comparison },
    validate: value => value === comparison,
    emit: (varName: string, ctx: EmitContext): string => {
      const i = ctx.addRef(comparison);
      return `if (${varName} !== refs[${i}]) ${ctx.fail('equals')};`;
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// notEquals — strict inequality (!==). comparison value passed via refs
// ─────────────────────────────────────────────────────────────────────────────

export function notEquals(comparison: unknown): EmittableRule {
  return makeRule({
    name: 'notEquals',
    constraints: { value: comparison },
    validate: value => value !== comparison,
    emit: (varName: string, ctx: EmitContext): string => {
      const i = ctx.addRef(comparison);
      return `if (${varName} === refs[${i}]) ${ctx.fail('notEquals')};`;
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// isEmpty — only undefined | null | '' are treated as empty
// ─────────────────────────────────────────────────────────────────────────────

export const isEmpty = makeRule({
  name: 'isEmpty',
  constraints: {},
  validate: value => value === undefined || value === null || value === '',
  emit: (varName: string, ctx: EmitContext): string =>
    `if (${varName} !== undefined && ${varName} !== null && ${varName} !== '') ${ctx.fail('isEmpty')};`,
});

// ─────────────────────────────────────────────────────────────────────────────
// isNotEmpty — any value other than undefined | null | ''
// ─────────────────────────────────────────────────────────────────────────────

export const isNotEmpty = makeRule({
  name: 'isNotEmpty',
  constraints: {},
  validate: value => value !== undefined && value !== null && value !== '',
  emit: (varName: string, ctx: EmitContext): string =>
    `if (${varName} === undefined || ${varName} === null || ${varName} === '') ${ctx.fail('isNotEmpty')};`,
});

// ─────────────────────────────────────────────────────────────────────────────
// isIn — checks inclusion in array. O(1) lookup via Set
// ─────────────────────────────────────────────────────────────────────────────

export function isIn(array: unknown[]): EmittableRule {
  const set = new Set(array);
  return makeRule({
    name: 'isIn',
    constraints: { values: array },
    validate: value => set.has(value),
    emit: (varName: string, ctx: EmitContext): string => {
      const i = ctx.addRef(set);
      return `if (!refs[${i}].has(${varName})) ${ctx.fail('isIn')};`;
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// isNotIn — checks exclusion from array. O(1) lookup via Set
// ─────────────────────────────────────────────────────────────────────────────

export function isNotIn(array: unknown[]): EmittableRule {
  const set = new Set(array);
  return makeRule({
    name: 'isNotIn',
    constraints: { values: array },
    validate: value => !set.has(value),
    emit: (varName: string, ctx: EmitContext): string => {
      const i = ctx.addRef(set);
      return `if (refs[${i}].has(${varName})) ${ctx.fail('isNotIn')};`;
    },
  });
}
