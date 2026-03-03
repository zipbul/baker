import type { EmitContext, EmittableRule } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// min — v >= n 검사. requiresType='number' (§4.7, §4.8 A)
// ─────────────────────────────────────────────────────────────────────────────

export function min(n: number, opts?: { exclusive?: boolean }): EmittableRule {
  const exclusive = opts?.exclusive ?? false;

  const fn = exclusive
    ? (value: unknown): boolean => (value as number) > n
    : (value: unknown): boolean => (value as number) >= n;

  (fn as any).emit = (varName: string, ctx: EmitContext): string =>
    exclusive
      ? `if (${varName} <= ${n}) ${ctx.fail('min')};`
      : `if (${varName} < ${n}) ${ctx.fail('min')};`;

  (fn as any).ruleName = 'min';
  (fn as any).requiresType = 'number';
  (fn as any).constraints = exclusive ? { min: n, exclusive: true } : { min: n };

  return fn as EmittableRule;
}

// ─────────────────────────────────────────────────────────────────────────────
// max — v <= n 검사. requiresType='number' (§4.7, §4.8 A)
// ─────────────────────────────────────────────────────────────────────────────

export function max(n: number, opts?: { exclusive?: boolean }): EmittableRule {
  const exclusive = opts?.exclusive ?? false;

  const fn = exclusive
    ? (value: unknown): boolean => (value as number) < n
    : (value: unknown): boolean => (value as number) <= n;

  (fn as any).emit = (varName: string, ctx: EmitContext): string =>
    exclusive
      ? `if (${varName} >= ${n}) ${ctx.fail('max')};`
      : `if (${varName} > ${n}) ${ctx.fail('max')};`;

  (fn as any).ruleName = 'max';
  (fn as any).requiresType = 'number';
  (fn as any).constraints = exclusive ? { max: n, exclusive: true } : { max: n };

  return fn as EmittableRule;
}

// ─────────────────────────────────────────────────────────────────────────────
// isPositive — v > 0 (0 포함 불가). requiresType='number' (§4.8 A)
// ─────────────────────────────────────────────────────────────────────────────

const _isPositive = (value: unknown): boolean => (value as number) > 0;

(_isPositive as any).emit = (varName: string, ctx: EmitContext): string =>
  `if (${varName} <= 0) ${ctx.fail('isPositive')};`;

(_isPositive as any).ruleName = 'isPositive';
(_isPositive as any).requiresType = 'number';
(_isPositive as any).constraints = { min: 0, exclusive: true };

export const isPositive = _isPositive as EmittableRule;

// ─────────────────────────────────────────────────────────────────────────────
// isNegative — v < 0 (0 포함 불가). requiresType='number' (§4.8 A)
// ─────────────────────────────────────────────────────────────────────────────

const _isNegative = (value: unknown): boolean => (value as number) < 0;

(_isNegative as any).emit = (varName: string, ctx: EmitContext): string =>
  `if (${varName} >= 0) ${ctx.fail('isNegative')};`;

(_isNegative as any).ruleName = 'isNegative';
(_isNegative as any).requiresType = 'number';
(_isNegative as any).constraints = { max: 0, exclusive: true };

export const isNegative = _isNegative as EmittableRule;

// ─────────────────────────────────────────────────────────────────────────────
// isDivisibleBy — v % n === 0 검사. requiresType='number' (§4.8 A)
// ─────────────────────────────────────────────────────────────────────────────

export function isDivisibleBy(n: number): EmittableRule {
  const fn = (value: unknown): boolean => (value as number) % n === 0;

  (fn as any).emit = (varName: string, ctx: EmitContext): string =>
    `if (${varName} % ${n} !== 0) ${ctx.fail('isDivisibleBy')};`;

  (fn as any).ruleName = 'isDivisibleBy';
  (fn as any).requiresType = 'number';
  (fn as any).constraints = { divisor: n };

  return fn as EmittableRule;
}
