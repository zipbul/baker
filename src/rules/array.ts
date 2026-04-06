import type { EmitContext, EmittableRule } from '../types';
import { makePlannedRule, makeRule, planCompare, planLength } from '../rule-plan';

// ─────────────────────────────────────────────────────────────────────────────
// arrayContains(values) — array contains all specified values
// ─────────────────────────────────────────────────────────────────────────────

export function arrayContains(values: unknown[]): EmittableRule {
  return makeRule({
    name: 'arrayContains',
    requiresType: 'array',
    constraints: { values },
    validate: (value) => Array.isArray(value) && values.every((v) => value.indexOf(v) !== -1),
    emit: (varName: string, ctx: EmitContext): string => {
      const i = ctx.addRef(values);
      return `if (!_refs[${i}].every(function(v){return ${varName}.indexOf(v)!==-1;})) ${ctx.fail('arrayContains')};`;
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// arrayNotContains(values) — array does not contain any of the specified values
// ─────────────────────────────────────────────────────────────────────────────

export function arrayNotContains(values: unknown[]): EmittableRule {
  return makeRule({
    name: 'arrayNotContains',
    requiresType: 'array',
    constraints: { values },
    validate: (value) => Array.isArray(value) && values.every((v) => !value.includes(v)),
    emit: (varName: string, ctx: EmitContext): string => {
      const i = ctx.addRef(values);
      return `if (_refs[${i}].some(function(v){return ${varName}.indexOf(v)!==-1;})) ${ctx.fail('arrayNotContains')};`;
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// arrayMinSize(min) — minimum array length
// ─────────────────────────────────────────────────────────────────────────────

export function arrayMinSize(min: number): EmittableRule {
  const plan = { cacheKey: 'length', failure: planCompare(planLength(), '<', min) } as const;
  return makePlannedRule({
    name: 'arrayMinSize',
    requiresType: 'array',
    constraints: { min },
    plan,
    validate: (value) => Array.isArray(value) && value.length >= min,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// arrayMaxSize(max) — maximum array length
// ─────────────────────────────────────────────────────────────────────────────

export function arrayMaxSize(max: number): EmittableRule {
  const plan = { cacheKey: 'length', failure: planCompare(planLength(), '>', max) } as const;
  return makePlannedRule({
    name: 'arrayMaxSize',
    requiresType: 'array',
    constraints: { max },
    plan,
    validate: (value) => Array.isArray(value) && value.length <= max,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// arrayUnique(identifier?) — no duplicates in array
// ─────────────────────────────────────────────────────────────────────────────

export function arrayUnique(identifier?: (val: unknown) => unknown): EmittableRule {
  return makeRule({
    name: 'arrayUnique',
    requiresType: 'array',
    constraints: {},
    validate: (value) => {
      if (!Array.isArray(value)) return false;
      if (identifier) {
        const keys = value.map(identifier);
        return new Set(keys).size === keys.length;
      }
      return new Set(value).size === value.length;
    },
    emit: (varName: string, ctx: EmitContext): string => {
      if (identifier) {
        const i = ctx.addRef(identifier);
        return `{var _keys=${varName}.map(_refs[${i}]);if(new Set(_keys).size!==_keys.length)${ctx.fail('arrayUnique')};}`;
      }
      return `if(new Set(${varName}).size!==${varName}.length)${ctx.fail('arrayUnique')};`;
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// arrayNotEmpty — array is not empty (singleton)
// ─────────────────────────────────────────────────────────────────────────────

const arrayNotEmptyPlan = { cacheKey: 'length', failure: planCompare(planLength(), '===', 0) } as const;
export const arrayNotEmpty = makePlannedRule({
  name: 'arrayNotEmpty',
  requiresType: 'array',
  constraints: {},
  plan: arrayNotEmptyPlan,
  validate: (value) => Array.isArray(value) && value.length > 0,
});
