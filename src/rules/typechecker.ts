import type { EmitContext, EmittableRule } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// isString — typeof check (§4.8 A: operator inline)
// ─────────────────────────────────────────────────────────────────────────────

const _isString = (value: unknown): boolean => typeof value === 'string';

(_isString as any).emit = (varName: string, ctx: EmitContext): string =>
  `if (typeof ${varName} !== 'string') ${ctx.fail('isString')};`;

(_isString as any).ruleName = 'isString';
(_isString as any).constraints = {};
// requiresType is undefined — includes its own typeof check (§4.7)

export const isString = _isString as EmittableRule;

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

  const fn = (value: unknown): boolean => {
    if (typeof value !== 'number') return false;
    // Check NaN first — since isFinite(NaN) is also false, order matters
    if (isNaN(value)) return allowNaN;
    // Non-NaN non-finite values (Infinity / -Infinity)
    if (!isFinite(value)) return allowInfinity;
    if (maxDecimalPlaces !== undefined) {
      const parts = value.toExponential().split('e');
      const mantissaDecimals = (parts[0]!.split('.')[1] || '').length;
      const exponent = parseInt(parts[1]!, 10);
      if (Math.max(0, mantissaDecimals - exponent) > maxDecimalPlaces) return false;
    }
    return true;
  };

  (fn as any).emit = (varName: string, ctx: EmitContext): string => {
    let code = `if (typeof ${varName} !== 'number') ${ctx.fail('isNumber')};`;
    if (!allowNaN) {
      code += `\nelse if (isNaN(${varName})) ${ctx.fail('isNumber')};`;
    }
    if (!allowInfinity) {
      // Explicit Infinity check instead of !isFinite — since isNaN(NaN)=false but !isFinite(NaN)=true, separation is needed
      code += `\nelse if (${varName} === Infinity || ${varName} === -Infinity) ${ctx.fail('isNumber')};`;
    }
    if (maxDecimalPlaces !== undefined) {
      code += `\nelse { var _exp=${varName}.toExponential().split('e'); var _mant=(_exp[0].split('.')[1]||'').length; var _exp2=parseInt(_exp[1],10); if(Math.max(0,_mant-_exp2)>${maxDecimalPlaces}) ${ctx.fail('isNumber')}; }`;
    }
    return code;
  };

  (fn as any).ruleName = 'isNumber';
  (fn as any).constraints = { allowNaN: options?.allowNaN, allowInfinity: options?.allowInfinity, maxDecimalPlaces: options?.maxDecimalPlaces };
  // requiresType is undefined — includes its own typeof check

  return fn as EmittableRule;
}

// ─────────────────────────────────────────────────────────────────────────────
// isBoolean — typeof check (§4.8 A)
// ─────────────────────────────────────────────────────────────────────────────

const _isBoolean = (value: unknown): boolean => typeof value === 'boolean';

(_isBoolean as any).emit = (varName: string, ctx: EmitContext): string =>
  `if (typeof ${varName} !== 'boolean') ${ctx.fail('isBoolean')};`;

(_isBoolean as any).ruleName = 'isBoolean';
(_isBoolean as any).constraints = {};

export const isBoolean = _isBoolean as EmittableRule;

// ─────────────────────────────────────────────────────────────────────────────
// isDate — instanceof Date + getTime() NaN check (§4.8 A)
// ─────────────────────────────────────────────────────────────────────────────

const _isDate = (value: unknown): boolean =>
  value instanceof Date && !isNaN((value as Date).getTime());

(_isDate as any).emit = (varName: string, ctx: EmitContext): string =>
  `if (!(${varName} instanceof Date) || isNaN(${varName}.getTime())) ${ctx.fail('isDate')};`;

(_isDate as any).ruleName = 'isDate';
(_isDate as any).constraints = {};

export const isDate = _isDate as EmittableRule;

// ─────────────────────────────────────────────────────────────────────────────
// isEnum — factory: indexOf check using Object.values array (§4.8 C)
// ─────────────────────────────────────────────────────────────────────────────

export function isEnum(entity: object): EmittableRule {
  const values = Object.values(entity);

  const fn = (value: unknown): boolean => values.indexOf(value) !== -1;

  (fn as any).emit = (varName: string, ctx: EmitContext): string => {
    const i = ctx.addRef(values);
    return `if (_refs[${i}].indexOf(${varName}) === -1) ${ctx.fail('isEnum')};`;
  };

  (fn as any).ruleName = 'isEnum';
  (fn as any).constraints = { values: Object.values(entity) };

  return fn as EmittableRule;
}

// ─────────────────────────────────────────────────────────────────────────────
// isInt — typeof + Number.isInteger check (§4.8 A)
// ─────────────────────────────────────────────────────────────────────────────

const _isInt = (value: unknown): boolean =>
  typeof value === 'number' && Number.isInteger(value);

(_isInt as any).emit = (varName: string, ctx: EmitContext): string =>
  `if (typeof ${varName} !== 'number' || !Number.isInteger(${varName})) ${ctx.fail('isInt')};`;

(_isInt as any).ruleName = 'isInt';
(_isInt as any).requiresType = 'number';
(_isInt as any).constraints = {};

export const isInt = _isInt as EmittableRule;

// ─────────────────────────────────────────────────────────────────────────────
// isArray — Array.isArray check (§4.8 A: operator inline)
// ─────────────────────────────────────────────────────────────────────────────

const _isArray = (value: unknown): boolean => Array.isArray(value);

(_isArray as any).emit = (varName: string, ctx: EmitContext): string =>
  `if (!Array.isArray(${varName})) ${ctx.fail('isArray')};`;

(_isArray as any).ruleName = 'isArray';
(_isArray as any).constraints = {};
// requiresType is undefined — includes its own Array.isArray check

export const isArray = _isArray as EmittableRule;

// ─────────────────────────────────────────────────────────────────────────────
// isObject — typeof object + non-null + non-array (§4.8 A)
// ─────────────────────────────────────────────────────────────────────────────

const _isObject = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

(_isObject as any).emit = (varName: string, ctx: EmitContext): string =>
  `if (typeof ${varName} !== 'object' || ${varName} === null || Array.isArray(${varName})) ${ctx.fail('isObject')};`;

(_isObject as any).ruleName = 'isObject';
(_isObject as any).constraints = {};
// requiresType is undefined — includes its own typeof + null + Array.isArray check

export const isObject = _isObject as EmittableRule;
