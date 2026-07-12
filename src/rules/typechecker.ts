import type { EmitContext, EmittableRule } from './interfaces';

import { RequiredType } from './enums';
import { makeRule } from './rule-plan';

// Codegen for the isNumber maxDecimalPlaces check — `decimals = max(0, mantissaDigits - exponent)`
// via toExponential(). Single source for both the inside-gate and standalone emit branches.
function emitMaxDecimalCheck(varName: string, maxDecimalPlaces: number, ctx: EmitContext): string {
  return `{ var exp=${varName}.toExponential().split('e'); var mant=(exp[0].split('.')[1]||'').length; var exp2=parseInt(exp[1],10); if(Math.max(0,mant-exp2)>${maxDecimalPlaces}) ${ctx.fail('isNumber')}; }`;
}

// ─────────────────────────────────────────────────────────────────────────────
// isString — typeof check (operator inline)
// ─────────────────────────────────────────────────────────────────────────────

export const isString = makeRule<string>({
  name: 'isString',
  constraints: {},
  validate: value => typeof value === 'string',
  emit: (varName: string, ctx: EmitContext): string => `if (typeof ${varName} !== 'string') ${ctx.fail('isString')};`,
});

// ─────────────────────────────────────────────────────────────────────────────
// isNumber — typeof + NaN/Infinity/maxDecimalPlaces options
// ─────────────────────────────────────────────────────────────────────────────

export interface IsNumberOptions {
  allowNaN?: boolean;
  allowInfinity?: boolean;
  maxDecimalPlaces?: number;
}

export function isNumber(options?: IsNumberOptions): EmittableRule<number> {
  const allowNaN = options?.allowNaN ?? false;
  const allowInfinity = options?.allowInfinity ?? false;
  const maxDecimalPlaces = options?.maxDecimalPlaces;

  // Expose only the options the caller actually set — omit undefined keys so `rule.constraints`
  // has a consistent shape with the other factories (no phantom `allowNaN: undefined`).
  const constraints: Record<string, unknown> = {};
  if (options?.allowNaN !== undefined) {
    constraints.allowNaN = options.allowNaN;
  }
  if (options?.allowInfinity !== undefined) {
    constraints.allowInfinity = options.allowInfinity;
  }
  if (maxDecimalPlaces !== undefined) {
    constraints.maxDecimalPlaces = maxDecimalPlaces;
  }

  const validate = (value: unknown): boolean => {
    if (typeof value !== 'number') {
      return false;
    }
    // Check NaN first — since isFinite(NaN) is also false, order matters
    if (isNaN(value)) {
      return allowNaN;
    }
    // Non-NaN non-finite values (Infinity / -Infinity)
    if (!isFinite(value)) {
      return allowInfinity;
    }
    if (maxDecimalPlaces !== undefined) {
      const parts = value.toExponential().split('e');
      const mantissaDecimals = (parts[0]!.split('.')[1] || '').length;
      const exponent = parseInt(parts[1]!, 10);
      if (Math.max(0, mantissaDecimals - exponent) > maxDecimalPlaces) {
        return false;
      }
    }
    return true;
  };

  return makeRule<number>({
    name: 'isNumber',
    constraints,
    validate,
    emit: (varName: string, ctx: EmitContext): string => {
      if (ctx.insideTypeGate) {
        // typeof + isNaN already verified by gate — emit only Infinity/maxDecimalPlaces checks
        let code = '';
        if (!allowInfinity) {
          code += `if (${varName} === Infinity || ${varName} === -Infinity) ${ctx.fail('isNumber')};`;
        }
        if (maxDecimalPlaces !== undefined) {
          code += `${code ? '\nelse ' : ''}${emitMaxDecimalCheck(varName, maxDecimalPlaces, ctx)}`;
        }
        return code;
      }
      let code = `if (typeof ${varName} !== 'number') ${ctx.fail('isNumber')};`;
      if (!allowNaN) {
        code += `\nelse if (isNaN(${varName})) ${ctx.fail('isNumber')};`;
      }
      if (!allowInfinity) {
        code += `\nelse if (${varName} === Infinity || ${varName} === -Infinity) ${ctx.fail('isNumber')};`;
      }
      if (maxDecimalPlaces !== undefined) {
        code += `\nelse ${emitMaxDecimalCheck(varName, maxDecimalPlaces, ctx)}`;
      }
      return code;
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// isBoolean — typeof check
// ─────────────────────────────────────────────────────────────────────────────

export const isBoolean = makeRule<boolean>({
  name: 'isBoolean',
  constraints: {},
  validate: value => typeof value === 'boolean',
  emit: (varName: string, ctx: EmitContext): string => `if (typeof ${varName} !== 'boolean') ${ctx.fail('isBoolean')};`,
});

// ─────────────────────────────────────────────────────────────────────────────
// isDate — instanceof Date + getTime() NaN check
// ─────────────────────────────────────────────────────────────────────────────

export const isDate = makeRule<Date>({
  name: 'isDate',
  constraints: {},
  validate: value => value instanceof Date && !isNaN(value.getTime()),
  emit: (varName: string, ctx: EmitContext): string =>
    `if (!(${varName} instanceof Date) || isNaN(${varName}.getTime())) ${ctx.fail('isDate')};`,
});

// ─────────────────────────────────────────────────────────────────────────────
// isEnum — factory: indexOf check using Object.values array
// ─────────────────────────────────────────────────────────────────────────────

export function isEnum(entity: object): EmittableRule<string | number> {
  // TS numeric enums compile to a reverse-mapped object ({ 0: 'Inactive', 1: 'Active', Active: 1,
  // Inactive: 0 }), so Object.values would also yield the member-name strings. Read values through the
  // non-numeric keys instead — this drops the reverse-map entries while keeping every real member,
  // and works for string, numeric, and heterogeneous enums.
  const values = Object.keys(entity)
    .filter(key => Number.isNaN(Number(key)))
    .map(key => (entity as Record<string, unknown>)[key]);
  // Set lookup is O(1); array indexOf is O(n). Measured (Bun/JSC):
  // - 4 items: indexOf 1.2 ns vs Set.has 2.2 ns (indexOf marginally faster)
  // - 50 items: indexOf 64 ns vs Set.has 8.4 ns (Set 7.5x faster)
  // Use Set when there are enough values to overcome its constant-factor overhead.
  const useSet = values.length >= 8;
  const valuesSet = useSet ? new Set(values) : null;

  return makeRule<string | number>({
    name: 'isEnum',
    constraints: { values },
    validate: useSet ? value => valuesSet!.has(value) : value => values.includes(value),
    emit: (varName: string, ctx: EmitContext): string => {
      if (useSet) {
        const i = ctx.addRef(valuesSet);
        return `if (!refs[${i}].has(${varName})) ${ctx.fail('isEnum')};`;
      }
      const i = ctx.addRef(values);
      return `if (!refs[${i}].includes(${varName})) ${ctx.fail('isEnum')};`;
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// isInt — typeof + Number.isInteger check
// ─────────────────────────────────────────────────────────────────────────────

export const isInt = makeRule<number>({
  name: 'isInt',
  requiresType: RequiredType.Number,
  constraints: {},
  validate: value => typeof value === 'number' && Number.isInteger(value),
  emit: (varName: string, ctx: EmitContext): string =>
    ctx.insideTypeGate
      ? `if (!Number.isInteger(${varName})) ${ctx.fail('isInt')};`
      : `if (typeof ${varName} !== 'number' || !Number.isInteger(${varName})) ${ctx.fail('isInt')};`,
});

// ─────────────────────────────────────────────────────────────────────────────
// isArray — Array.isArray check (operator inline)
// ─────────────────────────────────────────────────────────────────────────────

export const isArray = makeRule<readonly unknown[]>({
  name: 'isArray',
  constraints: {},
  validate: value => Array.isArray(value),
  emit: (varName: string, ctx: EmitContext): string => `if (!Array.isArray(${varName})) ${ctx.fail('isArray')};`,
});

// ─────────────────────────────────────────────────────────────────────────────
// isObject — typeof object + non-null + non-array
// ─────────────────────────────────────────────────────────────────────────────

export const isObject = makeRule<object>({
  name: 'isObject',
  constraints: {},
  validate: value => typeof value === 'object' && value !== null && !Array.isArray(value),
  emit: (varName: string, ctx: EmitContext): string =>
    `if (typeof ${varName} !== 'object' || ${varName} === null || Array.isArray(${varName})) ${ctx.fail('isObject')};`,
});

// ─────────────────────────────────────────────────────────────────────────────
// isRegExp — instanceof RegExp (self-narrowing, no typeof gate needed)
// ─────────────────────────────────────────────────────────────────────────────

export const isRegExp = makeRule<RegExp>({
  name: 'isRegExp',
  constraints: {},
  validate: value => value instanceof RegExp,
  emit: (varName: string, ctx: EmitContext): string => `if (!(${varName} instanceof RegExp)) ${ctx.fail('isRegExp')};`,
});

// ─────────────────────────────────────────────────────────────────────────────
// isFunction — typeof check (accepts arrow fns, unlike isInstance(Function))
// ─────────────────────────────────────────────────────────────────────────────

export const isFunction = makeRule<Function>({
  name: 'isFunction',
  constraints: {},
  validate: value => typeof value === 'function',
  emit: (varName: string, ctx: EmitContext): string => `if (typeof ${varName} !== 'function') ${ctx.fail('isFunction')};`,
});

// ─────────────────────────────────────────────────────────────────────────────
// isStatelessRegExp — RegExp without g/y (the only flags that mutate lastIndex
// across repeated test()/exec()). Safe for reuse as a single-shot matcher.
// ─────────────────────────────────────────────────────────────────────────────

export const isStatelessRegExp = makeRule<RegExp>({
  name: 'isStatelessRegExp',
  constraints: {},
  validate: value => value instanceof RegExp && !value.global && !value.sticky,
  emit: (varName: string, ctx: EmitContext): string =>
    `if (!(${varName} instanceof RegExp) || ${varName}.global || ${varName}.sticky) ${ctx.fail('isStatelessRegExp')};`,
});
