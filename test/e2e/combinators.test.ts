import { describe, it, expect, beforeEach } from 'bun:test';

import { Baker, isBakerIssueSet, Field, createRule } from '../../index';
import { oneOf, arrayEvery, isString, isBoolean, isRegExp, isFunction, isStatelessRegExp } from '../../src/rules/index';

const baker = new Baker();

beforeEach(() => baker.seal());

function errorsOf(result: unknown): readonly { path: string; code: string }[] {
  if (!isBakerIssueSet(result)) {
    throw new Error('expected validation failure');
  }
  return result.errors;
}

describe('oneOf', () => {
  @baker.Recipe
  class D {
    @Field(oneOf(isBoolean, isString)) v!: boolean | string;
  }
  it('passes for the first branch (boolean)', async () => {
    expect(((await baker.deserialize(D, { v: true })) as D).v).toBe(true);
  });
  it('passes for a later branch (string)', async () => {
    expect(((await baker.deserialize(D, { v: 'x' })) as D).v).toBe('x');
  });
  it('rejected when no branch matches, with code oneOf', async () => {
    const errs = errorsOf(await baker.deserialize(D, { v: 42 }));
    expect(errs.some(e => e.code === 'oneOf')).toBe(true);
  });
});

describe('oneOf error model', () => {
  @baker.Recipe
  class D {
    @Field(oneOf(isBoolean, isString)) a!: boolean | string;
    @Field(oneOf(isBoolean, isString)) b!: boolean | string;
  }
  it('emits exactly one oneOf issue at the failing field path, sibling unaffected', async () => {
    const oneOfErrs = errorsOf(await baker.deserialize(D, { a: 'ok', b: 42 })).filter(e => e.code === 'oneOf');
    expect(oneOfErrs.length).toBe(1);
    expect(oneOfErrs[0]!.path).toBe('b');
  });
});

describe('arrayEvery', () => {
  @baker.Recipe
  class D {
    @Field(arrayEvery(isString)) v!: string[];
  }
  it('passes when every element matches', async () => {
    expect(((await baker.deserialize(D, { v: ['a', 'b'] })) as D).v).toEqual(['a', 'b']);
  });
  it('passes for empty array', async () => {
    expect(((await baker.deserialize(D, { v: [] })) as D).v).toEqual([]);
  });
  it('rejected when an element fails, with code arrayEvery', async () => {
    const errs = errorsOf(await baker.deserialize(D, { v: ['a', 1] }));
    expect(errs.some(e => e.code === 'arrayEvery')).toBe(true);
  });
  it('rejected for a non-array', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'a' }))).toBe(true);
  });
});

describe('arrayEvery with an async element rule (executor must go async)', () => {
  const asyncEl = createRule('asyncEl', async (v: unknown) => typeof v === 'string' && v.startsWith('ok'));
  @baker.Recipe
  class D {
    @Field(arrayEvery(asyncEl)) v!: string[];
  }
  it('passes when every element passes the async rule', async () => {
    expect(((await baker.deserialize(D, { v: ['ok1', 'ok2'] })) as D).v).toEqual(['ok1', 'ok2']);
  });
  it('rejected when an element fails the async rule, with code arrayEvery', async () => {
    const errs = errorsOf(await baker.deserialize(D, { v: ['ok1', 'bad'] }));
    expect(errs.some(e => e.code === 'arrayEvery')).toBe(true);
  });
});

describe('oneOf + arrayEvery union (cors-style origin)', () => {
  @baker.Recipe
  class D {
    @Field(oneOf(isBoolean, isString, isRegExp, arrayEvery(oneOf(isString, isRegExp)), isFunction), { optional: true })
    origin?: boolean | string | RegExp | Array<string | RegExp> | ((o: string) => boolean);
  }
  it('accepts a boolean', async () => {
    expect(((await baker.deserialize(D, { origin: true })) as D).origin).toBe(true);
  });
  it('accepts a string', async () => {
    expect(((await baker.deserialize(D, { origin: 'https://a.com' })) as D).origin).toBe('https://a.com');
  });
  it('accepts a RegExp', async () => {
    const r = await baker.deserialize(D, { origin: /a\.com$/ });
    expect((r as D).origin).toBeInstanceOf(RegExp);
  });
  it('accepts an array of string|RegExp', async () => {
    const r = await baker.deserialize(D, { origin: ['https://a.com', /b\.com$/] });
    expect(Array.isArray((r as D).origin)).toBe(true);
  });
  it('accepts a function', async () => {
    const fn = (_o: string) => true;
    expect(((await baker.deserialize(D, { origin: fn })) as D).origin).toBe(fn);
  });
  it('rejected for a number', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { origin: 42 }))).toBe(true);
  });
  it('rejected for an array containing a non-string/RegExp element', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { origin: ['ok', 42] }))).toBe(true);
  });
});

describe('oneOf with an async branch (executor must go async)', () => {
  const asyncOrigin = createRule('asyncOrigin', async (v: unknown) => v === 'https://async.ok');
  @baker.Recipe
  class D {
    @Field(oneOf(asyncOrigin, isString)) v!: string;
  }
  it('passes via the async branch', async () => {
    expect(((await baker.deserialize(D, { v: 'https://async.ok' })) as D).v).toBe('https://async.ok');
  });
  it('passes via the sync branch', async () => {
    expect(((await baker.deserialize(D, { v: 'plain' })) as D).v).toBe('plain');
  });
  it('rejected when neither branch matches, with code oneOf', async () => {
    const errs = errorsOf(await baker.deserialize(D, { v: 42 }));
    expect(errs.some(e => e.code === 'oneOf')).toBe(true);
  });
});

describe('isRegExp', () => {
  @baker.Recipe
  class D {
    @Field(isRegExp) v!: RegExp;
  }
  it('passes for a RegExp', async () => {
    expect(((await baker.deserialize(D, { v: /x/ })) as D).v).toBeInstanceOf(RegExp);
  });
  it('rejected for a string', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'x' }))).toBe(true);
  });
});

describe('isStatelessRegExp', () => {
  @baker.Recipe
  class D {
    @Field(isStatelessRegExp) v!: RegExp;
  }
  it('passes for a stateless RegExp (no g/y)', async () => {
    expect(((await baker.deserialize(D, { v: /x/i })) as D).v).toBeInstanceOf(RegExp);
  });
  it('rejected for a global-flagged RegExp, with code isStatelessRegExp', async () => {
    const errs = errorsOf(await baker.deserialize(D, { v: /x/g }));
    expect(errs.some(e => e.code === 'isStatelessRegExp')).toBe(true);
  });
  it('rejected for a sticky-flagged RegExp, with code isStatelessRegExp', async () => {
    const errs = errorsOf(await baker.deserialize(D, { v: /x/y }));
    expect(errs.some(e => e.code === 'isStatelessRegExp')).toBe(true);
  });
  it('rejected for a global+stateless combo (/x/gi), with code isStatelessRegExp', async () => {
    const errs = errorsOf(await baker.deserialize(D, { v: /x/gi }));
    expect(errs.some(e => e.code === 'isStatelessRegExp')).toBe(true);
  });
  it('rejected for a non-RegExp', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'x' }))).toBe(true);
  });
});

describe('isFunction', () => {
  @baker.Recipe
  class D {
    @Field(isFunction) v!: (...args: unknown[]) => unknown;
  }
  it('passes for a function', async () => {
    const fn = () => {};
    expect(((await baker.deserialize(D, { v: fn })) as D).v).toBe(fn);
  });
  it('rejected for a non-function', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'x' }))).toBe(true);
  });
});
