import { describe, it, expect, afterEach } from 'bun:test';
import { Field, deserialize, BakerValidationError, createRule } from '../../index';
import { isNumber } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

const isEven = createRule({
  name: 'isEven',
  validate: (v) => typeof v === 'number' && v % 2 === 0,
  constraints: { divisor: 2 },
  requiresType: 'number',
});

class EvenDto {
  @Field(isNumber(), isEven)
  value!: number;
}

const asyncIsPositive = createRule({
  name: 'asyncPositive',
  validate: async (v) => typeof v === 'number' && v > 0,
});

class AsyncRuleDto {
  @Field(isNumber(), asyncIsPositive)
  score!: number;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('createRule — sync', () => {
  it('rule passes', async () => {
    const r = await deserialize<EvenDto>(EvenDto, { value: 4 });
    expect(r.value).toBe(4);
  });

  it('rule violation → custom error code', async () => {
    try {
      await deserialize(EvenDto, { value: 3 });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BakerValidationError);
      const err = (e as BakerValidationError).errors.find(e => e.code === 'isEven');
      expect(err).toBeDefined();
    }
  });

  it('can be called directly', () => {
    expect(isEven(4)).toBe(true);
    expect(isEven(3)).toBe(false);
  });
});

describe('createRule — async', () => {
  it('async rule passes', async () => {
    const r = await deserialize<AsyncRuleDto>(AsyncRuleDto, { score: 10 });
    expect(r.score).toBe(10);
  });

  it('async rule violation', async () => {
    try {
      await deserialize(AsyncRuleDto, { score: -1 });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BakerValidationError);
      const err = (e as BakerValidationError).errors.find(e => e.code === 'asyncPositive');
      expect(err).toBeDefined();
    }
  });
});
