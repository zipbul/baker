import { describe, it, expect } from 'bun:test';
import { deserialize, BakerValidationError, Field } from '../../index';
import { isNumber, isInt, isPositive, isNegative, isDivisibleBy } from '../../src/rules/index';

// ─────────────────────────────────────────────────────────────────────────────

class PositiveDto { @Field(isPositive) val!: number; }
class NegativeDto { @Field(isNegative) val!: number; }
class DivisibleDto { @Field(isDivisibleBy(3)) val!: number; }
class IntDto { @Field(isInt) val!: number; }

class NumberOptsDto {
  @Field(isNumber({ allowNaN: true }))
  nanOk!: number;

  @Field(isNumber({ allowInfinity: true }))
  infOk!: number;

  @Field(isNumber({ maxDecimalPlaces: 2 }))
  precise!: number;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('isPositive', () => {
  it('positive number passes', async () => {
    const r = await deserialize<PositiveDto>(PositiveDto, { val: 1 });
    expect(r.val).toBe(1);
  });
  it('0 rejected (exclusive)', async () => {
    await expect(deserialize(PositiveDto, { val: 0 })).rejects.toThrow(BakerValidationError);
  });
  it('negative number rejected', async () => {
    await expect(deserialize(PositiveDto, { val: -1 })).rejects.toThrow(BakerValidationError);
  });
});

describe('isNegative', () => {
  it('negative number passes', async () => {
    const r = await deserialize<NegativeDto>(NegativeDto, { val: -1 });
    expect(r.val).toBe(-1);
  });
  it('0 rejected (exclusive)', async () => {
    await expect(deserialize(NegativeDto, { val: 0 })).rejects.toThrow(BakerValidationError);
  });
  it('positive number rejected', async () => {
    await expect(deserialize(NegativeDto, { val: 1 })).rejects.toThrow(BakerValidationError);
  });
});

describe('isDivisibleBy', () => {
  it('divisible value passes', async () => {
    const r = await deserialize<DivisibleDto>(DivisibleDto, { val: 9 });
    expect(r.val).toBe(9);
  });
  it('0 also passes (0 % 3 === 0)', async () => {
    const r = await deserialize<DivisibleDto>(DivisibleDto, { val: 0 });
    expect(r.val).toBe(0);
  });
  it('non-divisible value rejected', async () => {
    await expect(deserialize(DivisibleDto, { val: 7 })).rejects.toThrow(BakerValidationError);
  });
});

describe('isInt', () => {
  it('integer passes', async () => {
    const r = await deserialize<IntDto>(IntDto, { val: 42 });
    expect(r.val).toBe(42);
  });
  it('decimal rejected', async () => {
    await expect(deserialize(IntDto, { val: 3.14 })).rejects.toThrow(BakerValidationError);
  });
  it('negative integer passes', async () => {
    const r = await deserialize<IntDto>(IntDto, { val: -10 });
    expect(r.val).toBe(-10);
  });
});

describe('isNumber options', () => {
  it('allowNaN: true → NaN passes', async () => {
    const r = await deserialize<NumberOptsDto>(NumberOptsDto, {
      nanOk: NaN, infOk: Infinity, precise: 1.23,
    });
    expect(r.nanOk).toBeNaN();
  });

  it('allowInfinity: true → Infinity passes', async () => {
    const r = await deserialize<NumberOptsDto>(NumberOptsDto, {
      nanOk: NaN, infOk: Infinity, precise: 1.23,
    });
    expect(r.infOk).toBe(Infinity);
  });

  it('maxDecimalPlaces exceeded rejected', async () => {
    await expect(
      deserialize(NumberOptsDto, { nanOk: NaN, infOk: Infinity, precise: 1.234 }),
    ).rejects.toThrow(BakerValidationError);
  });

  it('within maxDecimalPlaces passes', async () => {
    const r = await deserialize<NumberOptsDto>(NumberOptsDto, {
      nanOk: NaN, infOk: Infinity, precise: 1.23,
    });
    expect(r.precise).toBe(1.23);
  });
});
