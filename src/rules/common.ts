import type { EmitContext, EmittableRule } from './interfaces';
import type { WidenLiteral } from './types';

import { makeRule } from './rule-plan';

// ─────────────────────────────────────────────────────────────────────────────
// equals — strict equality (===). comparison value passed via refs
// ─────────────────────────────────────────────────────────────────────────────

export function equals<T>(comparison: T): EmittableRule<WidenLiteral<T>> {
  return makeRule<WidenLiteral<T>>({
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

export function notEquals<T>(comparison: T): EmittableRule<WidenLiteral<T>> {
  return makeRule<WidenLiteral<T>>({
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

// isEmpty/isNotEmpty are genuinely type-agnostic (used on string, number, and untyped fields), so they
// carry `EmittableRule<never>`: `never` is assignable to every `EmittableRule<V>`, so it composes with a
// typed sibling WITHOUT weakening that sibling's field check (`@Field(isString, isEmpty)` still requires
// a string field), and `FieldValue` maps an all-`never` field domain to "any field" for standalone use.
export const isEmpty = makeRule<never>({
  name: 'isEmpty',
  constraints: {},
  validate: value => value === undefined || value === null || value === '',
  emit: (varName: string, ctx: EmitContext): string =>
    `if (${varName} !== undefined && ${varName} !== null && ${varName} !== '') ${ctx.fail('isEmpty')};`,
});

// ─────────────────────────────────────────────────────────────────────────────
// isNotEmpty — any value other than undefined | null | ''
// ─────────────────────────────────────────────────────────────────────────────

export const isNotEmpty = makeRule<never>({
  name: 'isNotEmpty',
  constraints: {},
  validate: value => value !== undefined && value !== null && value !== '',
  emit: (varName: string, ctx: EmitContext): string =>
    `if (${varName} === undefined || ${varName} === null || ${varName} === '') ${ctx.fail('isNotEmpty')};`,
});

// ─────────────────────────────────────────────────────────────────────────────
// isIn — checks inclusion in array. O(1) lookup via Set
// ─────────────────────────────────────────────────────────────────────────────

export function isIn<const A extends readonly unknown[]>(array: A): EmittableRule<WidenLiteral<A[number]>> {
  const set = new Set(array);
  return makeRule<WidenLiteral<A[number]>>({
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

export function isNotIn<const A extends readonly unknown[]>(array: A): EmittableRule<WidenLiteral<A[number]>> {
  const set = new Set(array);
  return makeRule<WidenLiteral<A[number]>>({
    name: 'isNotIn',
    constraints: { values: array },
    validate: value => !set.has(value),
    emit: (varName: string, ctx: EmitContext): string => {
      const i = ctx.addRef(set);
      return `if (refs[${i}].has(${varName})) ${ctx.fail('isNotIn')};`;
    },
  });
}
