import { describe, it, expect, beforeEach } from 'bun:test';

import { Baker, isBakerIssueSet, Field } from '../../index';
import { isNumber, isInt, isPositive, isNegative, isDivisibleBy } from '../../src/rules/index';

const baker = new Baker();

beforeEach(() => baker.seal());

// ─────────────────────────────────────────────────────────────────────────────

@baker.Recipe
class PositiveDto {
  @Field(isPositive) val!: number;
}
@baker.Recipe
class NegativeDto {
  @Field(isNegative) val!: number;
}
@baker.Recipe
class DivisibleDto {
  @Field(isDivisibleBy(3)) val!: number;
}
@baker.Recipe
class IntDto {
  @Field(isInt) val!: number;
}

@baker.Recipe
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
    const r = (await baker.deserialize(PositiveDto, { val: 1 })) as PositiveDto;
    expect(r.val).toBe(1);
  });
  it('0 rejected (exclusive)', async () => {
    expect(isBakerIssueSet(await baker.deserialize(PositiveDto, { val: 0 }))).toBe(true);
  });
  it('negative number rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(PositiveDto, { val: -1 }))).toBe(true);
  });
});

describe('isNegative', () => {
  it('negative number passes', async () => {
    const r = (await baker.deserialize(NegativeDto, { val: -1 })) as NegativeDto;
    expect(r.val).toBe(-1);
  });
  it('0 rejected (exclusive)', async () => {
    expect(isBakerIssueSet(await baker.deserialize(NegativeDto, { val: 0 }))).toBe(true);
  });
  it('positive number rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(NegativeDto, { val: 1 }))).toBe(true);
  });
});

describe('isDivisibleBy', () => {
  it('divisible value passes', async () => {
    const r = (await baker.deserialize(DivisibleDto, { val: 9 })) as DivisibleDto;
    expect(r.val).toBe(9);
  });
  it('0 also passes (0 % 3 === 0)', async () => {
    const r = (await baker.deserialize(DivisibleDto, { val: 0 })) as DivisibleDto;
    expect(r.val).toBe(0);
  });
  it('non-divisible value rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(DivisibleDto, { val: 7 }))).toBe(true);
  });
});

describe('isInt', () => {
  it('integer passes', async () => {
    const r = (await baker.deserialize(IntDto, { val: 42 })) as IntDto;
    expect(r.val).toBe(42);
  });
  it('decimal rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(IntDto, { val: 3.14 }))).toBe(true);
  });
  it('negative integer passes', async () => {
    const r = (await baker.deserialize(IntDto, { val: -10 })) as IntDto;
    expect(r.val).toBe(-10);
  });
});

describe('isNumber options', () => {
  it('allowNaN: true → NaN passes', async () => {
    const r = (await baker.deserialize(NumberOptsDto, {
      nanOk: NaN,
      infOk: Infinity,
      precise: 1.23,
    })) as NumberOptsDto;
    expect(r.nanOk).toBeNaN();
  });

  it('allowInfinity: true → Infinity passes', async () => {
    const r = (await baker.deserialize(NumberOptsDto, {
      nanOk: NaN,
      infOk: Infinity,
      precise: 1.23,
    })) as NumberOptsDto;
    expect(r.infOk).toBe(Infinity);
  });

  it('maxDecimalPlaces exceeded rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(NumberOptsDto, { nanOk: NaN, infOk: Infinity, precise: 1.234 }))).toBe(true);
  });

  it('within maxDecimalPlaces passes', async () => {
    const r = (await baker.deserialize(NumberOptsDto, {
      nanOk: NaN,
      infOk: Infinity,
      precise: 1.23,
    })) as NumberOptsDto;
    expect(r.precise).toBe(1.23);
  });
});
