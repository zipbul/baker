import { describe, it, expect } from 'bun:test';

import type { Transformer } from '../../src/transformers/types';

import { Baker, Field, BakerError, isBakerIssueSet } from '../../index';
import { isString } from '../../src/rules/index';
import { assertBakerIssueSet } from './helpers/assert';

/** Capture the thrown value so its `.cause`/type can be asserted (toThrow cannot inspect the instance). */
function thrown(fn: () => void): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return undefined;
}

describe('throw channel — runtime API misuse throws BakerError', () => {
  it('deserialize() on an unsealed class throws BakerError', () => {
    const b = new Baker();
    @b.Recipe
    class Unsealed {
      @Field(isString) v!: string;
    }
    void b;
    expect(() => b.deserialize(Unsealed, { v: 'x' })).toThrow(BakerError);
    expect(() => b.deserialize(Unsealed, { v: 'x' })).toThrow(/not sealed/);
  });

  it('new Baker() with an unknown config key throws BakerError', () => {
    expect(() => new Baker({ nope: true } as never)).toThrow(BakerError);
    expect(() => new Baker({ nope: true } as never)).toThrow(/unknown key/);
  });

  it('an unknown per-call option throws BakerError', () => {
    const b = new Baker();
    @b.Recipe
    class Called {
      @Field(isString) v!: string;
    }
    b.seal();
    expect(() => b.deserialize(Called, { v: 'x' }, { nope: 1 } as never)).toThrow(BakerError);
    expect(() => b.deserialize(Called, { v: 'x' }, { nope: 1 } as never)).toThrow(/Unknown per-call option/);
  });
});

describe('throw channel — sync transform returning a Promise throws BakerError', () => {
  it('a sync deserialize transform that returns a Promise throws at runtime', () => {
    const promiseTransform: Transformer = {
      deserialize: ({ value }) => Promise.resolve(value),
      serialize: ({ value }) => value,
    };
    const b = new Baker();
    @b.Recipe
    class Transformed {
      @Field({ transform: promiseTransform }) v!: string;
    }
    b.seal();
    expect(() => b.deserialize(Transformed, { v: 'x' })).toThrow(BakerError);
    expect(() => b.deserialize(Transformed, { v: 'x' })).toThrow(/transform returned Promise/);
  });
});

describe('throw channel — seal preserves the original error as cause', () => {
  it('a throwing @Field type function surfaces as BakerError with cause', () => {
    const boom = new Error('type-fn boom');
    const b = new Baker();
    @b.Recipe
    class BadType {
      @Field({
        type: () => {
          throw boom;
        },
      })
      child?: unknown;
      @Field(isString) v!: string;
    }
    void BadType;
    const caught = thrown(() => b.seal());
    expect(caught).toBeInstanceOf(BakerError);
    expect((caught as { cause?: unknown }).cause).toBe(boom);
  });

  it('a throwing collectionValue function surfaces as BakerError with cause', () => {
    const boom = new Error('collectionValue boom');
    const b = new Baker();
    @b.Recipe
    class BadCollection {
      @Field({
        type: () => Set,
        setValue: () => {
          throw boom;
        },
      })
      items?: Set<unknown>;
      @Field(isString) v!: string;
    }
    void BadCollection;
    const caught = thrown(() => b.seal());
    expect(caught).toBeInstanceOf(BakerError);
    expect((caught as { cause?: unknown }).cause).toBe(boom);
  });
});

describe('result channel — external input failures return a BakerIssueSet', () => {
  it('deserialize() returns a BakerIssueSet on invalid input', async () => {
    const b = new Baker();
    @b.Recipe
    class Target {
      @Field(isString) v!: string;
    }
    b.seal();
    const result = await b.deserialize(Target, { v: 123 });
    expect(isBakerIssueSet(result)).toBe(true);
    assertBakerIssueSet(result);
    expect(result.errors[0]!.path).toBe('v');
    expect(result.errors[0]!.code).toBe('isString');
  });

  it('validate() returns a BakerIssueSet on invalid input', async () => {
    const b = new Baker();
    @b.Recipe
    class Target {
      @Field(isString) v!: string;
    }
    b.seal();
    const result = await b.validate(Target, { v: 123 });
    expect(isBakerIssueSet(result)).toBe(true);
  });
});
