import type { EmitContext, EmittableRule } from './interfaces';
import type { UnionOfDomains } from './types';

import { BakerError } from '../common';
import { makeRule } from './rule-plan';

// ─────────────────────────────────────────────────────────────────────────────
// oneOf — OR combinator: value matches at least one of the given rules.
// (Not JSON-Schema `oneOf`/exactly-one — semantics is "matches at least one",
//  first matching branch wins, short-circuit.)
// ─────────────────────────────────────────────────────────────────────────────

function oneOf<const B extends readonly EmittableRule<unknown>[]>(...branches: B): EmittableRule<UnionOfDomains<B>> {
  if (branches.length === 0) {
    throw new BakerError('oneOf requires at least one rule.');
  }
  const constraints = { oneOf: branches.map(b => b.ruleName) };
  const isAsync = branches.some(b => b.isAsync === true);

  if (isAsync) {
    const validate = async (value: unknown): Promise<boolean> => {
      for (const b of branches) {
        if (await b(value)) {
          return true;
        }
      }
      return false;
    };
    return makeRule<UnionOfDomains<B>>({
      name: 'oneOf',
      constraints,
      isAsync: true,
      validate,
      emit: (varName: string, ctx: EmitContext): string => {
        const i = ctx.addRef(validate);
        return `if (!(await refs[${i}](${varName}))) ${ctx.fail('oneOf')};`;
      },
    });
  }

  // Sync branch: `isAsync` was false, so every branch returns boolean — view them as sync once here
  // instead of asserting `as boolean` on each call.
  const syncBranches = branches as readonly ((value: unknown) => boolean)[];
  const validate = (value: unknown): boolean => syncBranches.some(b => b(value));
  return makeRule<UnionOfDomains<B>>({
    name: 'oneOf',
    constraints,
    validate,
    emit: (varName: string, ctx: EmitContext): string => {
      const calls = branches.map(b => `refs[${ctx.addRef(b)}](${varName})`).join(' || ');
      return `if (!(${calls})) ${ctx.fail('oneOf')};`;
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// arrayEvery — value is an array and every element satisfies all given rules
// (AND over the rules, applied per element). Arrays only — Set/Map element
// validation stays at the @Field level via arrayOf.
// ─────────────────────────────────────────────────────────────────────────────

function arrayEvery<E>(...rules: EmittableRule<E>[]): EmittableRule<readonly E[]> {
  if (rules.length === 0) {
    throw new BakerError('arrayEvery requires at least one rule.');
  }
  const constraints = { arrayEvery: rules.map(r => r.ruleName) };
  const isAsync = rules.some(r => r.isAsync === true);

  if (isAsync) {
    const validate = async (value: unknown): Promise<boolean> => {
      if (!Array.isArray(value)) {
        return false;
      }
      for (const el of value) {
        for (const r of rules) {
          if (!(await r(el))) {
            return false;
          }
        }
      }
      return true;
    };
    return makeRule<readonly E[]>({
      name: 'arrayEvery',
      constraints,
      isAsync: true,
      validate,
      emit: (varName: string, ctx: EmitContext): string => {
        const i = ctx.addRef(validate);
        return `if (!(await refs[${i}](${varName}))) ${ctx.fail('arrayEvery')};`;
      },
    });
  }

  // Sync branch: every rule returns boolean (see oneOf) — view them as sync once.
  const syncRules = rules as ((value: unknown) => boolean)[];
  const elementPredicate = (el: unknown): boolean => syncRules.every(r => r(el));
  const validate = (value: unknown): boolean => Array.isArray(value) && value.every(elementPredicate);
  return makeRule<readonly E[]>({
    name: 'arrayEvery',
    constraints,
    validate,
    emit: (varName: string, ctx: EmitContext): string => {
      const i = ctx.addRef(elementPredicate);
      return `if (!(Array.isArray(${varName}) && ${varName}.every(refs[${i}]))) ${ctx.fail('arrayEvery')};`;
    },
  });
}

export { oneOf, arrayEvery };
