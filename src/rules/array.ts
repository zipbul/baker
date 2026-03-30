import type { EmitContext, EmittableRule } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// arrayContains(values) — array contains all specified values
// ─────────────────────────────────────────────────────────────────────────────

export function arrayContains(values: unknown[]): EmittableRule {
  const fn = (value: unknown): boolean => {
    if (!Array.isArray(value)) return false;
    return values.every((v) => value.indexOf(v) !== -1);
  };

  (fn as any).emit = (varName: string, ctx: EmitContext): string => {
    const i = ctx.addRef(values);
    return `if (!_refs[${i}].every(function(v){return ${varName}.indexOf(v)!==-1;})) ${ctx.fail('arrayContains')};`;
  };
  (fn as any).ruleName = 'arrayContains';
  (fn as any).constraints = { values: values };

  return fn as EmittableRule;
}

// ─────────────────────────────────────────────────────────────────────────────
// arrayNotContains(values) — array does not contain any of the specified values
// ─────────────────────────────────────────────────────────────────────────────

export function arrayNotContains(values: unknown[]): EmittableRule {
  const fn = (value: unknown): boolean => {
    if (!Array.isArray(value)) return false;
    return values.every((v) => !value.includes(v));
  };

  (fn as any).emit = (varName: string, ctx: EmitContext): string => {
    const i = ctx.addRef(values);
    return `if (_refs[${i}].some(function(v){return ${varName}.indexOf(v)!==-1;})) ${ctx.fail('arrayNotContains')};`;
  };
  (fn as any).ruleName = 'arrayNotContains';
  (fn as any).constraints = { values: values };

  return fn as EmittableRule;
}

// ─────────────────────────────────────────────────────────────────────────────
// arrayMinSize(min) — minimum array length
// ─────────────────────────────────────────────────────────────────────────────

export function arrayMinSize(min: number): EmittableRule {
  const fn = (value: unknown): boolean =>
    Array.isArray(value) && value.length >= min;

  (fn as any).emit = (varName: string, ctx: EmitContext): string =>
    `if (${varName}.length < ${min}) ${ctx.fail('arrayMinSize')};`;
  (fn as any).ruleName = 'arrayMinSize';
  (fn as any).constraints = { min: min };

  return fn as EmittableRule;
}

// ─────────────────────────────────────────────────────────────────────────────
// arrayMaxSize(max) — maximum array length
// ─────────────────────────────────────────────────────────────────────────────

export function arrayMaxSize(max: number): EmittableRule {
  const fn = (value: unknown): boolean =>
    Array.isArray(value) && value.length <= max;

  (fn as any).emit = (varName: string, ctx: EmitContext): string =>
    `if (${varName}.length > ${max}) ${ctx.fail('arrayMaxSize')};`;
  (fn as any).ruleName = 'arrayMaxSize';
  (fn as any).constraints = { max: max };

  return fn as EmittableRule;
}

// ─────────────────────────────────────────────────────────────────────────────
// arrayUnique(identifier?) — no duplicates in array
// ─────────────────────────────────────────────────────────────────────────────

export function arrayUnique(identifier?: (val: unknown) => unknown): EmittableRule {
  const fn = (value: unknown): boolean => {
    if (!Array.isArray(value)) return false;
    if (identifier) {
      const keys = value.map(identifier);
      return new Set(keys).size === keys.length;
    }
    return new Set(value).size === value.length;
  };

  (fn as any).emit = (varName: string, ctx: EmitContext): string => {
    if (identifier) {
      const i = ctx.addRef(identifier);
      return `{var _keys=${varName}.map(_refs[${i}]);if(new Set(_keys).size!==_keys.length)${ctx.fail('arrayUnique')};}`;
    }
    return `if(new Set(${varName}).size!==${varName}.length)${ctx.fail('arrayUnique')};`;
  };
  (fn as any).ruleName = 'arrayUnique';
  (fn as any).constraints = {};

  return fn as EmittableRule;
}

// ─────────────────────────────────────────────────────────────────────────────
// arrayNotEmpty — array is not empty (singleton)
// ─────────────────────────────────────────────────────────────────────────────

const _arrayNotEmpty = (value: unknown): boolean =>
  Array.isArray(value) && value.length > 0;

(_arrayNotEmpty as any).emit = (varName: string, ctx: EmitContext): string =>
  `if (${varName}.length === 0) ${ctx.fail('arrayNotEmpty')};`;
(_arrayNotEmpty as any).ruleName = 'arrayNotEmpty';
(_arrayNotEmpty as any).constraints = {};
export const arrayNotEmpty = _arrayNotEmpty as EmittableRule;
