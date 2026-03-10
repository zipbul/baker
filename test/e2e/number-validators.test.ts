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
  it('양수 통과', async () => {
    const r = await deserialize<PositiveDto>(PositiveDto, { val: 1 });
    expect(r.val).toBe(1);
  });
  it('0 거부 (exclusive)', async () => {
    await expect(deserialize(PositiveDto, { val: 0 })).rejects.toThrow(BakerValidationError);
  });
  it('음수 거부', async () => {
    await expect(deserialize(PositiveDto, { val: -1 })).rejects.toThrow(BakerValidationError);
  });
});

describe('isNegative', () => {
  it('음수 통과', async () => {
    const r = await deserialize<NegativeDto>(NegativeDto, { val: -1 });
    expect(r.val).toBe(-1);
  });
  it('0 거부 (exclusive)', async () => {
    await expect(deserialize(NegativeDto, { val: 0 })).rejects.toThrow(BakerValidationError);
  });
  it('양수 거부', async () => {
    await expect(deserialize(NegativeDto, { val: 1 })).rejects.toThrow(BakerValidationError);
  });
});

describe('isDivisibleBy', () => {
  it('나누어 떨어지는 값 통과', async () => {
    const r = await deserialize<DivisibleDto>(DivisibleDto, { val: 9 });
    expect(r.val).toBe(9);
  });
  it('0도 통과 (0 % 3 === 0)', async () => {
    const r = await deserialize<DivisibleDto>(DivisibleDto, { val: 0 });
    expect(r.val).toBe(0);
  });
  it('나누어지지 않는 값 거부', async () => {
    await expect(deserialize(DivisibleDto, { val: 7 })).rejects.toThrow(BakerValidationError);
  });
});

describe('isInt', () => {
  it('정수 통과', async () => {
    const r = await deserialize<IntDto>(IntDto, { val: 42 });
    expect(r.val).toBe(42);
  });
  it('소수 거부', async () => {
    await expect(deserialize(IntDto, { val: 3.14 })).rejects.toThrow(BakerValidationError);
  });
  it('음의 정수 통과', async () => {
    const r = await deserialize<IntDto>(IntDto, { val: -10 });
    expect(r.val).toBe(-10);
  });
});

describe('isNumber options', () => {
  it('allowNaN: true → NaN 통과', async () => {
    const r = await deserialize<NumberOptsDto>(NumberOptsDto, {
      nanOk: NaN, infOk: Infinity, precise: 1.23,
    });
    expect(r.nanOk).toBeNaN();
  });

  it('allowInfinity: true → Infinity 통과', async () => {
    const r = await deserialize<NumberOptsDto>(NumberOptsDto, {
      nanOk: NaN, infOk: Infinity, precise: 1.23,
    });
    expect(r.infOk).toBe(Infinity);
  });

  it('maxDecimalPlaces 초과 거부', async () => {
    await expect(
      deserialize(NumberOptsDto, { nanOk: NaN, infOk: Infinity, precise: 1.234 }),
    ).rejects.toThrow(BakerValidationError);
  });

  it('maxDecimalPlaces 이내 통과', async () => {
    const r = await deserialize<NumberOptsDto>(NumberOptsDto, {
      nanOk: NaN, infOk: Infinity, precise: 1.23,
    });
    expect(r.precise).toBe(1.23);
  });
});
