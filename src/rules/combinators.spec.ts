import { describe, it, expect, mock } from 'bun:test';

import type { EmitContext } from './interfaces';

import { oneOf, arrayEvery } from './combinators';
import { createRule } from './create-rule';
import { isString, isBoolean, isNumber } from './typechecker';

// addRef returns incrementing indices so multiple branches map to distinct refs[i].
function makeCtx() {
  let n = 0;
  const refs: unknown[] = [];
  const addRefMock = mock((v: unknown) => {
    refs.push(v);
    return n++;
  });
  const failMock = mock((code: string) => `FAIL(${code})`);
  const ctx: Partial<EmitContext> = {
    addRegex: mock(() => 0),
    addRef: addRefMock,
    addExecutor: mock(() => 0),
    fail: failMock,
    collectErrors: true,
  };
  return { ctx: ctx as EmitContext, addRefMock, failMock, refs };
}

const asyncRule = createRule('asyncRule', async (v: unknown) => v === 'async-ok');

// ─── oneOf ───────────────────────────────────────────────────────────────────

describe('oneOf', () => {
  it('should return true when the value matches the first branch', () => {
    expect(oneOf(isString, isBoolean)('hello')).toBe(true);
  });

  it('should return true when the value matches a later branch', () => {
    expect(oneOf(isString, isBoolean)(true)).toBe(true);
  });

  it('should return false when the value matches no branch', () => {
    expect(oneOf(isString, isBoolean)(42)).toBe(false);
  });

  it('should accept regardless of branch order', () => {
    expect(oneOf(isBoolean, isString)('x')).toBe(true);
    expect(oneOf(isString, isBoolean)('x')).toBe(true);
  });

  it('should work nested', () => {
    const rule = oneOf(oneOf(isString, isBoolean), isNumber());
    expect(rule('x')).toBe(true);
    expect(rule(true)).toBe(true);
    expect(rule(1)).toBe(true);
    expect(rule({})).toBe(false);
  });

  it('should throw at construction when given zero branches', () => {
    expect(() => oneOf()).toThrow();
  });

  it('should have ruleName oneOf and undefined requiresType', () => {
    const rule = oneOf(isString, isBoolean);
    expect(rule.ruleName).toBe('oneOf');
    expect(rule.requiresType).toBeUndefined();
  });

  it('should expose branch names in constraints', () => {
    const rule = oneOf(isString, isBoolean);
    expect(rule.constraints?.oneOf).toEqual(['isString', 'isBoolean']);
  });

  it('should not be async when all branches are sync', () => {
    expect(oneOf(isString, isBoolean).isAsync).toBeFalsy();
  });

  it('should be async when any branch is async', () => {
    expect(oneOf(asyncRule, isString).isAsync).toBe(true);
  });

  it('should return a Promise resolving to true for a matching async branch', async () => {
    expect(await oneOf(asyncRule, isString)('async-ok')).toBe(true);
  });

  it('should short-circuit and not evaluate later branches once one matches (sync)', () => {
    let calls = 0;
    const spy = createRule('spySync', () => {
      calls++;
      return false;
    });
    expect(oneOf(isString, spy)('x')).toBe(true);
    expect(calls).toBe(0);
  });

  it('should evaluate branches sequentially and short-circuit (async, no Promise.all)', async () => {
    let calls = 0;
    const asyncSpy = createRule('asyncSpy', async () => {
      calls++;
      return false;
    });
    // first branch matches synchronously -> the async spy must never be awaited/called
    expect(await oneOf(isString, asyncSpy)('x')).toBe(true);
    expect(calls).toBe(0);
  });

  // emit — sync: inline OR of each branch's runtime fn
  it('should emit an inlined OR of branch refs when all branches are sync', () => {
    const { ctx, addRefMock, failMock } = makeCtx();
    const code = oneOf(isString, isBoolean).emit('v', ctx);
    expect(addRefMock).toHaveBeenCalledTimes(2);
    expect(code).toContain('refs[0](v)');
    expect(code).toContain('refs[1](v)');
    expect(code).toContain('||');
    expect(code).not.toContain('await');
    expect(failMock).toHaveBeenCalledWith('oneOf');
  });

  // emit — async: wholesale delegation to the single runtime validate fn
  it('should emit a single awaited delegation when any branch is async', () => {
    const { ctx, addRefMock, failMock } = makeCtx();
    const code = oneOf(asyncRule, isString).emit('v', ctx);
    expect(addRefMock).toHaveBeenCalledTimes(1);
    expect(code).toContain('await refs[0](v)');
    expect(failMock).toHaveBeenCalledWith('oneOf');
  });
});

// ─── arrayEvery ──────────────────────────────────────────────────────────────

describe('arrayEvery', () => {
  it('should return true when every element satisfies the rule', () => {
    expect(arrayEvery(isString)(['a', 'b', 'c'])).toBe(true);
  });

  it('should return true for an empty array (vacuous)', () => {
    expect(arrayEvery(isString)([])).toBe(true);
  });

  it('should return false when any element fails', () => {
    expect(arrayEvery(isString)(['a', 1, 'c'])).toBe(false);
  });

  it('should return false for a non-array value (incl. Set — arrays only)', () => {
    for (const v of ['abc', 42, null, undefined, {}, new Set(['a']), new Map()]) {
      expect(arrayEvery(isString)(v)).toBe(false);
    }
  });

  it('should AND multiple element rules', () => {
    const rule = arrayEvery(isNumber(), isNumber({ allowNaN: false }));
    expect(rule([1, 2, 3])).toBe(true);
    expect(rule([1, NaN])).toBe(false);
  });

  it('should compose with oneOf as the element rule', () => {
    const rule = arrayEvery(oneOf(isString, isBoolean));
    expect(rule(['a', true, 'b'])).toBe(true);
    expect(rule(['a', 1])).toBe(false);
  });

  it('should throw at construction when given zero rules', () => {
    expect(() => arrayEvery()).toThrow();
  });

  it('should return a Promise resolving to true when async element rules all pass', async () => {
    expect(await arrayEvery(asyncRule)(['async-ok', 'async-ok'])).toBe(true);
  });

  it('should have ruleName arrayEvery and undefined requiresType', () => {
    const rule = arrayEvery(isString);
    expect(rule.ruleName).toBe('arrayEvery');
    expect(rule.requiresType).toBeUndefined();
  });

  it('should be async when an element rule is async', () => {
    expect(arrayEvery(asyncRule).isAsync).toBe(true);
  });

  // emit — sync: Array.isArray guard + every over element predicate ref
  it('should emit an Array.isArray guard and an every() over a ref when sync', () => {
    const { ctx, addRefMock, failMock } = makeCtx();
    const code = arrayEvery(isString).emit('v', ctx);
    expect(addRefMock).toHaveBeenCalled();
    expect(code).toContain('Array.isArray(v)');
    expect(code).toContain('refs[0]');
    expect(failMock).toHaveBeenCalledWith('arrayEvery');
  });

  // emit — async: wholesale delegation
  it('should emit a single awaited delegation when an element rule is async', () => {
    const { ctx, addRefMock, failMock } = makeCtx();
    const code = arrayEvery(asyncRule).emit('v', ctx);
    expect(addRefMock).toHaveBeenCalledTimes(1);
    expect(code).toContain('await refs[0](v)');
    expect(failMock).toHaveBeenCalledWith('arrayEvery');
  });
});
