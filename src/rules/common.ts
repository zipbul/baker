import type { EmitContext, EmittableRule } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// equals — strict equality (===). comparison value passed via refs (§4.8 C)
// ─────────────────────────────────────────────────────────────────────────────

export function equals(comparison: unknown): EmittableRule {
  const fn = (value: unknown): boolean => value === comparison;

  (fn as any).emit = (varName: string, ctx: EmitContext): string => {
    const i = ctx.addRef(comparison);
    return `if (${varName} !== _refs[${i}]) ${ctx.fail('equals')};`;
  };

  (fn as any).ruleName = 'equals';
  (fn as any).constraints = { value: comparison };

  return fn as EmittableRule;
}

// ─────────────────────────────────────────────────────────────────────────────
// notEquals — strict inequality (!==). comparison value passed via refs
// ─────────────────────────────────────────────────────────────────────────────

export function notEquals(comparison: unknown): EmittableRule {
  const fn = (value: unknown): boolean => value !== comparison;

  (fn as any).emit = (varName: string, ctx: EmitContext): string => {
    const i = ctx.addRef(comparison);
    return `if (${varName} === _refs[${i}]) ${ctx.fail('notEquals')};`;
  };

  (fn as any).ruleName = 'notEquals';
  (fn as any).constraints = { value: comparison };

  return fn as EmittableRule;
}

// ─────────────────────────────────────────────────────────────────────────────
// isEmpty — only undefined | null | '' are treated as empty (§4.8 A)
// ─────────────────────────────────────────────────────────────────────────────

const _isEmpty = (value: unknown): boolean =>
  value === undefined || value === null || value === '';

(_isEmpty as any).emit = (varName: string, ctx: EmitContext): string =>
  `if (${varName} !== undefined && ${varName} !== null && ${varName} !== '') ${ctx.fail('isEmpty')};`;

(_isEmpty as any).ruleName = 'isEmpty';
(_isEmpty as any).constraints = {};

export const isEmpty = _isEmpty as EmittableRule;

// ─────────────────────────────────────────────────────────────────────────────
// isNotEmpty — any value other than undefined | null | '' (§4.8 A)
// ─────────────────────────────────────────────────────────────────────────────

const _isNotEmpty = (value: unknown): boolean =>
  value !== undefined && value !== null && value !== '';

(_isNotEmpty as any).emit = (varName: string, ctx: EmitContext): string =>
  `if (${varName} === undefined || ${varName} === null || ${varName} === '') ${ctx.fail('isNotEmpty')};`;

(_isNotEmpty as any).ruleName = 'isNotEmpty';
(_isNotEmpty as any).constraints = {};

export const isNotEmpty = _isNotEmpty as EmittableRule;

// ─────────────────────────────────────────────────────────────────────────────
// isIn — checks inclusion in array. O(1) lookup via Set (§4.8 C)
// ─────────────────────────────────────────────────────────────────────────────

export function isIn(array: unknown[]): EmittableRule {
  const set = new Set(array);
  const fn = (value: unknown): boolean => set.has(value);

  (fn as any).emit = (varName: string, ctx: EmitContext): string => {
    const i = ctx.addRef(set);
    return `if (!_refs[${i}].has(${varName})) ${ctx.fail('isIn')};`;
  };

  (fn as any).ruleName = 'isIn';
  (fn as any).constraints = { values: array };

  return fn as EmittableRule;
}

// ─────────────────────────────────────────────────────────────────────────────
// isNotIn — checks exclusion from array. O(1) lookup via Set (§4.8 C)
// ─────────────────────────────────────────────────────────────────────────────

export function isNotIn(array: unknown[]): EmittableRule {
  const set = new Set(array);
  const fn = (value: unknown): boolean => !set.has(value);

  (fn as any).emit = (varName: string, ctx: EmitContext): string => {
    const i = ctx.addRef(set);
    return `if (_refs[${i}].has(${varName})) ${ctx.fail('isNotIn')};`;
  };

  (fn as any).ruleName = 'isNotIn';
  (fn as any).constraints = { values: array };

  return fn as EmittableRule;
}
