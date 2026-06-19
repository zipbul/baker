import type { EmitContext, EmittableRule } from './types';

import { BakerError } from '../common/errors';
import { makeRule } from '../rule-plan';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Assert that a value is a baker rule (callable with `.emit` fn + `.ruleName` string). */
function assertRuleArg(value: unknown, combinator: string): asserts value is EmittableRule {
  if (
    typeof value === 'function' &&
    typeof (value as { emit?: unknown }).emit === 'function' &&
    typeof (value as { ruleName?: unknown }).ruleName === 'string'
  ) {
    return;
  }
  throw new BakerError(
    `${combinator}: every argument must be a baker rule (function with .emit and .ruleName). Use createRule() or import a rule from @zipbul/baker/rules.`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// oneOf — OR combinator: value matches at least one of the given rules.
// (Not JSON-Schema `oneOf`/exactly-one — semantics is "matches at least one",
//  first matching branch wins, short-circuit.)
// ─────────────────────────────────────────────────────────────────────────────

function oneOf(...branches: EmittableRule[]): EmittableRule {
  if (branches.length === 0) {
    throw new BakerError('oneOf requires at least one rule.');
  }
  for (const b of branches) {
    assertRuleArg(b, 'oneOf');
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
    return makeRule({
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

  const validate = (value: unknown): boolean => branches.some(b => b(value) as boolean);
  return makeRule({
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

function arrayEvery(...rules: EmittableRule[]): EmittableRule {
  if (rules.length === 0) {
    throw new BakerError('arrayEvery requires at least one rule.');
  }
  for (const r of rules) {
    assertRuleArg(r, 'arrayEvery');
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
    return makeRule({
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

  const elementPredicate = (el: unknown): boolean => rules.every(r => r(el) as boolean);
  const validate = (value: unknown): boolean => Array.isArray(value) && value.every(elementPredicate);
  return makeRule({
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
