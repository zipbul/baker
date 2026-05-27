import type { EmitContext, EmittableRule } from '../types';

import { makeRule } from '../rule-plan';

// ─────────────────────────────────────────────────────────────────────────────
// isString — typeof check (§4.8 A: operator inline)
// ─────────────────────────────────────────────────────────────────────────────

export const isString = makeRule({
  name: 'isString',
  constraints: {},
  validate: value => typeof value === 'string',
  emit: (varName: string, ctx: EmitContext): string => `if (typeof ${varName} !== 'string') ${ctx.fail('isString')};`,
});

// ─────────────────────────────────────────────────────────────────────────────
// isNumber — typeof + NaN/Infinity/maxDecimalPlaces options (§4.8 A)
// ─────────────────────────────────────────────────────────────────────────────

export interface IsNumberOptions {
  allowNaN?: boolean;
  allowInfinity?: boolean;
  maxDecimalPlaces?: number;
}

export function isNumber(options?: IsNumberOptions): EmittableRule {
  const allowNaN = options?.allowNaN ?? false;
  const allowInfinity = options?.allowInfinity ?? false;
  const maxDecimalPlaces = options?.maxDecimalPlaces;

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

  return makeRule({
    name: 'isNumber',
    constraints: {
      allowNaN: options?.allowNaN,
      allowInfinity: options?.allowInfinity,
      maxDecimalPlaces: options?.maxDecimalPlaces,
    },
    validate,
    emit: (varName: string, ctx: EmitContext): string => {
      if (ctx.insideTypeGate) {
        // typeof + isNaN already verified by gate — emit only Infinity/maxDecimalPlaces checks
        let code = '';
        if (!allowInfinity) {
          code += `if (${varName} === Infinity || ${varName} === -Infinity) ${ctx.fail('isNumber')};`;
        }
        if (maxDecimalPlaces !== undefined) {
          code += `${code ? '\nelse ' : ''}{ var exp=${varName}.toExponential().split('e'); var mant=(exp[0].split('.')[1]||'').length; var exp2=parseInt(exp[1],10); if(Math.max(0,mant-exp2)>${maxDecimalPlaces}) ${ctx.fail('isNumber')}; }`;
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
        code += `\nelse { var exp=${varName}.toExponential().split('e'); var mant=(exp[0].split('.')[1]||'').length; var exp2=parseInt(exp[1],10); if(Math.max(0,mant-exp2)>${maxDecimalPlaces}) ${ctx.fail('isNumber')}; }`;
      }
      return code;
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// isBoolean — typeof check (§4.8 A)
// ─────────────────────────────────────────────────────────────────────────────

export const isBoolean = makeRule({
  name: 'isBoolean',
  constraints: {},
  validate: value => typeof value === 'boolean',
  emit: (varName: string, ctx: EmitContext): string => `if (typeof ${varName} !== 'boolean') ${ctx.fail('isBoolean')};`,
});

// ─────────────────────────────────────────────────────────────────────────────
// isDate — instanceof Date + getTime() NaN check (§4.8 A)
// ─────────────────────────────────────────────────────────────────────────────

export const isDate = makeRule({
  name: 'isDate',
  constraints: {},
  validate: value => value instanceof Date && !isNaN(value.getTime()),
  emit: (varName: string, ctx: EmitContext): string =>
    `if (!(${varName} instanceof Date) || isNaN(${varName}.getTime())) ${ctx.fail('isDate')};`,
});

// ─────────────────────────────────────────────────────────────────────────────
// isEnum — factory: indexOf check using Object.values array (§4.8 C)
// ─────────────────────────────────────────────────────────────────────────────

export function isEnum(entity: object): EmittableRule {
  const values = Object.values(entity);
  // Set lookup is O(1); array indexOf is O(n). Measured (Bun/JSC):
  // - 4 items: indexOf 1.2 ns vs Set.has 2.2 ns (indexOf marginally faster)
  // - 50 items: indexOf 64 ns vs Set.has 8.4 ns (Set 7.5x faster)
  // Use Set when there are enough values to overcome its constant-factor overhead.
  const useSet = values.length >= 8;
  const valuesSet = useSet ? new Set(values) : null;

  return makeRule({
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
// isInt — typeof + Number.isInteger check (§4.8 A)
// ─────────────────────────────────────────────────────────────────────────────

export const isInt = makeRule({
  name: 'isInt',
  requiresType: 'number',
  constraints: {},
  validate: value => typeof value === 'number' && Number.isInteger(value),
  emit: (varName: string, ctx: EmitContext): string =>
    ctx.insideTypeGate
      ? `if (!Number.isInteger(${varName})) ${ctx.fail('isInt')};`
      : `if (typeof ${varName} !== 'number' || !Number.isInteger(${varName})) ${ctx.fail('isInt')};`,
});

// ─────────────────────────────────────────────────────────────────────────────
// isArray — Array.isArray check (§4.8 A: operator inline)
// ─────────────────────────────────────────────────────────────────────────────

export const isArray = makeRule({
  name: 'isArray',
  constraints: {},
  validate: value => Array.isArray(value),
  emit: (varName: string, ctx: EmitContext): string => `if (!Array.isArray(${varName})) ${ctx.fail('isArray')};`,
});

// ─────────────────────────────────────────────────────────────────────────────
// isObject — typeof object + non-null + non-array (§4.8 A)
// ─────────────────────────────────────────────────────────────────────────────

export const isObject = makeRule({
  name: 'isObject',
  constraints: {},
  validate: value => typeof value === 'object' && value !== null && !Array.isArray(value),
  emit: (varName: string, ctx: EmitContext): string =>
    `if (typeof ${varName} !== 'object' || ${varName} === null || Array.isArray(${varName})) ${ctx.fail('isObject')};`,
});

// ─────────────────────────────────────────────────────────────────────────────
// isRegExp — instanceof RegExp (self-narrowing, no typeof gate needed)
// ─────────────────────────────────────────────────────────────────────────────

export const isRegExp = makeRule({
  name: 'isRegExp',
  constraints: {},
  validate: value => value instanceof RegExp,
  emit: (varName: string, ctx: EmitContext): string => `if (!(${varName} instanceof RegExp)) ${ctx.fail('isRegExp')};`,
});

// ─────────────────────────────────────────────────────────────────────────────
// isFunction — typeof check (accepts arrow fns, unlike isInstance(Function))
// ─────────────────────────────────────────────────────────────────────────────

export const isFunction = makeRule({
  name: 'isFunction',
  constraints: {},
  validate: value => typeof value === 'function',
  emit: (varName: string, ctx: EmitContext): string =>
    `if (typeof ${varName} !== 'function') ${ctx.fail('isFunction')};`,
});
