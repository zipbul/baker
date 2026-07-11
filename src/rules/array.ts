import type { EmitContext, EmittableRule } from './interfaces';
import type { CollectionValue } from './types';

import { CacheKey } from '../common';
import { RequiredType, RuleOp } from './enums';
import { makePlannedRule, makeRule, planCompare, planLength } from './rule-plan';

// ─────────────────────────────────────────────────────────────────────────────
// arrayContains(values) — array contains all specified values
// ─────────────────────────────────────────────────────────────────────────────

function arrayContains(values: unknown[]): EmittableRule<CollectionValue> {
  return makeRule<CollectionValue>({
    name: 'arrayContains',
    requiresType: RequiredType.Array,
    constraints: { values },
    validate: value => Array.isArray(value) && values.every(v => value.includes(v)),
    emit: (varName: string, ctx: EmitContext): string => {
      const i = ctx.addRef(values);
      return `if (!refs[${i}].every(function(v){return ${varName}.includes(v);})) ${ctx.fail('arrayContains')};`;
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// arrayNotContains(values) — array does not contain any of the specified values
// ─────────────────────────────────────────────────────────────────────────────

function arrayNotContains(values: unknown[]): EmittableRule<CollectionValue> {
  return makeRule<CollectionValue>({
    name: 'arrayNotContains',
    requiresType: RequiredType.Array,
    constraints: { values },
    validate: value => Array.isArray(value) && values.every(v => !value.includes(v)),
    emit: (varName: string, ctx: EmitContext): string => {
      const i = ctx.addRef(values);
      return `if (refs[${i}].some(function(v){return ${varName}.includes(v);})) ${ctx.fail('arrayNotContains')};`;
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// arrayMinSize(min) — minimum array length
// ─────────────────────────────────────────────────────────────────────────────

function arrayMinSize(min: number): EmittableRule<CollectionValue> {
  const plan = { cacheKey: CacheKey.Length, failure: planCompare(planLength(), RuleOp.Lt, min) } as const;
  return makePlannedRule<CollectionValue>({
    name: 'arrayMinSize',
    requiresType: RequiredType.Array,
    constraints: { min },
    plan,
    validate: value => Array.isArray(value) && value.length >= min,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// arrayMaxSize(max) — maximum array length
// ─────────────────────────────────────────────────────────────────────────────

function arrayMaxSize(max: number): EmittableRule<CollectionValue> {
  const plan = { cacheKey: CacheKey.Length, failure: planCompare(planLength(), RuleOp.Gt, max) } as const;
  return makePlannedRule<CollectionValue>({
    name: 'arrayMaxSize',
    requiresType: RequiredType.Array,
    constraints: { max },
    plan,
    validate: value => Array.isArray(value) && value.length <= max,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// arrayUnique(identifier?) — no duplicates in array
// ─────────────────────────────────────────────────────────────────────────────

function arrayUnique(identifier?: (val: unknown) => unknown): EmittableRule<CollectionValue> {
  return makeRule<CollectionValue>({
    name: 'arrayUnique',
    requiresType: RequiredType.Array,
    constraints: {},
    validate: value => {
      if (!Array.isArray(value)) {
        return false;
      }
      if (identifier) {
        const keys = value.map(identifier);
        return new Set(keys).size === keys.length;
      }
      return new Set(value).size === value.length;
    },
    emit: (varName: string, ctx: EmitContext): string => {
      if (identifier) {
        const i = ctx.addRef(identifier);
        return `{var keys=${varName}.map(refs[${i}]);if(new Set(keys).size!==keys.length)${ctx.fail('arrayUnique')};}`;
      }
      return `if(new Set(${varName}).size!==${varName}.length)${ctx.fail('arrayUnique')};`;
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// arrayNotEmpty — array is not empty (singleton)
// ─────────────────────────────────────────────────────────────────────────────

const arrayNotEmptyPlan = { cacheKey: CacheKey.Length, failure: planCompare(planLength(), RuleOp.Eq, 0) } as const;
const arrayNotEmpty = makePlannedRule<CollectionValue>({
  name: 'arrayNotEmpty',
  requiresType: RequiredType.Array,
  constraints: {},
  plan: arrayNotEmptyPlan,
  validate: value => Array.isArray(value) && value.length > 0,
});
export { arrayContains, arrayNotContains, arrayMinSize, arrayMaxSize, arrayUnique, arrayNotEmpty };
