import { describe, it, expect, afterEach, beforeEach } from 'bun:test';

import { Baker, Field, deserialize, createRule, RequiredType } from '../../index';
import { isNumber } from '../../src/rules/index';
import { assertBakerIssueSet } from '../integration/helpers/assert';
import { sealClass } from '../integration/helpers/seal';
import { unseal } from '../integration/helpers/unseal';

const baker = new Baker();

beforeEach(() => baker.seal());
afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

const isEven = createRule({
  name: 'isEven',
  validate: v => typeof v === 'number' && v % 2 === 0,
  constraints: { divisor: 2 },
  requiresType: RequiredType.Number,
});

@baker.Recipe
class EvenDto {
  @Field(isNumber(), isEven)
  value!: number;
}

const asyncIsPositive = createRule({
  name: 'asyncPositive',
  validate: async v => typeof v === 'number' && v > 0,
});

@baker.Recipe
class AsyncRuleDto {
  @Field(isNumber(), asyncIsPositive)
  score!: number;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('createRule — sync', () => {
  it('rule passes', async () => {
    const r = (await deserialize(EvenDto, { value: 4 })) as EvenDto;
    expect(r.value).toBe(4);
  });

  it('rule violation → custom error code', async () => {
    const result = await deserialize(EvenDto, { value: 3 });
    assertBakerIssueSet(result);
    const err = result.errors.find(e => e.code === 'isEven');
    expect(err).toBeDefined();
  });

  it('can be called directly', () => {
    expect(isEven(4)).toBe(true);
    expect(isEven(3)).toBe(false);
  });
});

describe('createRule — async', () => {
  it('async rule passes', async () => {
    const r = (await deserialize(AsyncRuleDto, { score: 10 })) as AsyncRuleDto;
    expect(r.score).toBe(10);
  });

  it('async rule violation', async () => {
    const result = await deserialize(AsyncRuleDto, { score: -1 });
    assertBakerIssueSet(result);
    const err = result.errors.find(e => e.code === 'asyncPositive');
    expect(err).toBeDefined();
  });

  it('promise-returning non-async rule violation throws contract error', () => {
    const promiseFalseRule = createRule({
      name: 'promiseFalse',
      validate: () => Promise.resolve(false),
    });

    class PromiseRuleDto {
      @Field(promiseFalseRule)
      value!: string;
    }
    sealClass(PromiseRuleDto);

    expect(() => deserialize(PromiseRuleDto, { value: 'x' })).toThrow('sync rule returned Promise');
  });
});
