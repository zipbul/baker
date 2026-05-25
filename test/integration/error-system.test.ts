import { describe, it, expect, beforeEach, afterEach } from 'bun:test';

import type { Transformer } from '../../src/types';

import { deserialize, validate, configure, seal, Field, Recipe, BakerError, isBakerIssueSet } from '../../index';
import { isString } from '../../src/rules/index';
import { assertBakerIssueSet } from './helpers/assert';
import { purgePoisonClasses, unseal } from './helpers/unseal';

beforeEach(() => unseal());
afterEach(() => {
  purgePoisonClasses();
  unseal();
});

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
    @Recipe
    class Unsealed {
      @Field(isString) v!: string;
    }
    expect(() => deserialize(Unsealed, { v: 'x' })).toThrow(BakerError);
    expect(() => deserialize(Unsealed, { v: 'x' })).toThrow(/not sealed/);
  });

  it('configure() after seal() throws BakerError', () => {
    seal();
    expect(() => configure({})).toThrow(BakerError);
    expect(() => configure({})).toThrow(/after seal/);
  });

  it('configure() with an unknown key throws BakerError', () => {
    expect(() => (configure as (c: unknown) => void)({ nope: true })).toThrow(BakerError);
    expect(() => (configure as (c: unknown) => void)({ nope: true })).toThrow(/unknown key/);
  });

  it('an unknown per-call option throws BakerError', () => {
    @Recipe
    class Called {
      @Field(isString) v!: string;
    }
    seal();
    expect(() => deserialize(Called, { v: 'x' }, { nope: 1 } as never)).toThrow(BakerError);
    expect(() => deserialize(Called, { v: 'x' }, { nope: 1 } as never)).toThrow(/Unknown per-call option/);
  });
});

describe('throw channel — sync transform returning a Promise throws BakerError', () => {
  it('a sync deserialize transform that returns a Promise throws at runtime', () => {
    const promiseTransform: Transformer = {
      deserialize: ({ value }) => Promise.resolve(value),
      serialize: ({ value }) => value,
    };
    @Recipe
    class Transformed {
      @Field({ transform: promiseTransform }) v!: string;
    }
    seal();
    expect(() => deserialize(Transformed, { v: 'x' })).toThrow(BakerError);
    expect(() => deserialize(Transformed, { v: 'x' })).toThrow(/transform returned Promise/);
  });
});

describe('throw channel — seal preserves the original error as cause', () => {
  it('a throwing @Field type function surfaces as BakerError with cause', () => {
    const boom = new Error('type-fn boom');
    @Recipe
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
    const caught = thrown(() => seal());
    expect(caught).toBeInstanceOf(BakerError);
    expect((caught as { cause?: unknown }).cause).toBe(boom);
  });

  it('a throwing collectionValue function surfaces as BakerError with cause', () => {
    const boom = new Error('collectionValue boom');
    @Recipe
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
    const caught = thrown(() => seal());
    expect(caught).toBeInstanceOf(BakerError);
    expect((caught as { cause?: unknown }).cause).toBe(boom);
  });
});

describe('result channel — external input failures return a BakerIssueSet', () => {
  it('deserialize() returns a BakerIssueSet on invalid input', async () => {
    @Recipe
    class Target {
      @Field(isString) v!: string;
    }
    seal();
    const result = await deserialize(Target, { v: 123 });
    expect(isBakerIssueSet(result)).toBe(true);
    assertBakerIssueSet(result);
    expect(result.errors[0]!.path).toBe('v');
    expect(result.errors[0]!.code).toBe('isString');
  });

  it('validate() returns a BakerIssueSet on invalid input', async () => {
    @Recipe
    class Target {
      @Field(isString) v!: string;
    }
    seal();
    const result = await validate(Target, { v: 123 });
    expect(isBakerIssueSet(result)).toBe(true);
  });
});
