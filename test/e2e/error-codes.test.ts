import { describe, it, expect, beforeEach } from 'bun:test';

import { Baker, Field, isBakerIssueSet } from '../../index';
import {
  isString,
  isNumber,
  isBoolean,
  isDate,
  isEnum,
  isInt,
  isArray,
  isObject,
  equals,
  notEquals,
  isIn,
  isNotIn,
  isEmpty,
  isNotEmpty,
  min,
  max,
  isPositive,
  isNegative,
  isDivisibleBy,
  minLength,
  maxLength,
  length,
  contains,
  notContains,
  matches,
  isEmail,
  isURL,
  isUUID,
  isIP,
  isISO8601,
  arrayMinSize,
  arrayMaxSize,
  arrayUnique,
  arrayNotEmpty,
  arrayContains,
  arrayNotContains,
  isNotEmptyObject,
  isInstance,
  isLowercase,
  isUppercase,
  isAscii,
  isAlpha,
  isAlphanumeric,
  isNumberString,
  isDecimal,
  isBooleanString,
  isJSON,
  minDate,
  maxDate,
  isHexColor,
  isSemVer,
  isMongoId,
  isCreditCard,
  isPort,
  isFQDN,
} from '../../src/rules/index';

const baker = new Baker();

beforeEach(() => baker.seal());

/** Helper: extracts the error code for a specific path from BakerIssueSet */
async function getErrorCode(cls: new (...args: never[]) => unknown, input: unknown, path?: string): Promise<string> {
  const result = await baker.deserialize(cls, input);
  if (!isBakerIssueSet(result)) {
    throw new Error('expected validation failure');
  }
  const err = path !== undefined ? result.errors.find(x => x.path === path) : result.errors[0];
  if (!err) {
    throw new Error(`no error at path="${path}", got: ${JSON.stringify(result.errors)}`);
  }
  return err.code;
}

// ─── type checker error codes ────────────────────────────────────────────────

describe('type checker error codes', () => {
  @baker.Recipe
  class StringDto {
    @Field(isString) v!: string;
  }
  @baker.Recipe
  class NumberDto {
    @Field(isNumber()) v!: number;
  }
  @baker.Recipe
  class BooleanDto {
    @Field(isBoolean) v!: boolean;
  }
  @baker.Recipe
  class DateDto {
    @Field(isDate) v!: Date;
  }
  @baker.Recipe
  class IntDto {
    @Field(isInt) v!: number;
  }
  @baker.Recipe
  class ArrayDto {
    @Field(isArray) v!: unknown[];
  }
  @baker.Recipe
  class ObjectDto {
    @Field(isObject) v!: object;
  }
  enum Color {
    Red = 'red',
    Blue = 'blue',
  }
  @baker.Recipe
  class EnumDto {
    @Field(isEnum(Color)) v!: Color;
  }

  it('isString', async () => {
    expect(await getErrorCode(StringDto, { v: 123 })).toBe('isString');
  });
  it('isNumber', async () => {
    expect(await getErrorCode(NumberDto, { v: 'abc' })).toBe('isNumber');
  });
  it('isBoolean', async () => {
    expect(await getErrorCode(BooleanDto, { v: 'true' })).toBe('isBoolean');
  });
  it('isDate', async () => {
    expect(await getErrorCode(DateDto, { v: 'not-a-date' })).toBe('isDate');
  });
  it('isInt', async () => {
    expect(await getErrorCode(IntDto, { v: 1.5 })).toBe('isInt');
  });
  it('isArray', async () => {
    expect(await getErrorCode(ArrayDto, { v: 'notarray' })).toBe('isArray');
  });
  it('isObject', async () => {
    expect(await getErrorCode(ObjectDto, { v: 'notobj' })).toBe('isObject');
  });
  it('isEnum', async () => {
    expect(await getErrorCode(EnumDto, { v: 'green' })).toBe('isEnum');
  });
});

// ─── common decorator error codes ──────────────────────────────────────────

describe('common decorator error codes', () => {
  @baker.Recipe
  class DefinedDto {
    @Field() v!: string;
  }
  @baker.Recipe
  class EqualsDto {
    @Field(equals('yes')) v!: string;
  }
  @baker.Recipe
  class NotEqualsDto {
    @Field(notEquals('no')) v!: string;
  }
  @baker.Recipe
  class IsInDto {
    @Field(isIn(['a', 'b'])) v!: string;
  }
  @baker.Recipe
  class IsNotInDto {
    @Field(isNotIn(['x'])) v!: string;
  }
  @baker.Recipe
  class EmptyDto {
    @Field(isEmpty) v!: string;
  }
  @baker.Recipe
  class NotEmptyDto {
    @Field(isNotEmpty) v!: string;
  }

  it('isDefined', async () => {
    expect(await getErrorCode(DefinedDto, {})).toBe('isDefined');
  });
  it('equals', async () => {
    expect(await getErrorCode(EqualsDto, { v: 'no' })).toBe('equals');
  });
  it('notEquals', async () => {
    expect(await getErrorCode(NotEqualsDto, { v: 'no' })).toBe('notEquals');
  });
  it('isIn', async () => {
    expect(await getErrorCode(IsInDto, { v: 'c' })).toBe('isIn');
  });
  it('isNotIn', async () => {
    expect(await getErrorCode(IsNotInDto, { v: 'x' })).toBe('isNotIn');
  });
  it('isEmpty', async () => {
    expect(await getErrorCode(EmptyDto, { v: 'something' })).toBe('isEmpty');
  });
  it('isNotEmpty', async () => {
    expect(await getErrorCode(NotEmptyDto, { v: '' })).toBe('isNotEmpty');
  });
});

// ─── number decorator error codes ──────────────────────────────────────────

describe('number decorator error codes', () => {
  @baker.Recipe
  class MinDto {
    @Field(min(5)) v!: number;
  }
  @baker.Recipe
  class MaxDto {
    @Field(max(10)) v!: number;
  }
  @baker.Recipe
  class PositiveDto {
    @Field(isPositive) v!: number;
  }
  @baker.Recipe
  class NegativeDto {
    @Field(isNegative) v!: number;
  }
  @baker.Recipe
  class DivisibleDto {
    @Field(isDivisibleBy(3)) v!: number;
  }

  it('min', async () => {
    expect(await getErrorCode(MinDto, { v: 2 })).toBe('min');
  });
  it('max', async () => {
    expect(await getErrorCode(MaxDto, { v: 15 })).toBe('max');
  });
  it('isPositive', async () => {
    expect(await getErrorCode(PositiveDto, { v: -1 })).toBe('isPositive');
  });
  it('isNegative', async () => {
    expect(await getErrorCode(NegativeDto, { v: 1 })).toBe('isNegative');
  });
  it('isDivisibleBy', async () => {
    expect(await getErrorCode(DivisibleDto, { v: 4 })).toBe('isDivisibleBy');
  });
});

// ─── string decorator error codes ────────────────────────────────────────

describe('string decorator error codes', () => {
  @baker.Recipe
  class MinLenDto {
    @Field(minLength(3)) v!: string;
  }
  @baker.Recipe
  class MaxLenDto {
    @Field(maxLength(5)) v!: string;
  }
  @baker.Recipe
  class LenDto {
    @Field(length(2, 4)) v!: string;
  }
  @baker.Recipe
  class ContainsDto {
    @Field(contains('foo')) v!: string;
  }
  @baker.Recipe
  class NotContainsDto {
    @Field(notContains('bar')) v!: string;
  }
  @baker.Recipe
  class MatchesDto {
    @Field(matches(/^\d+$/)) v!: string;
  }
  @baker.Recipe
  class LowercaseDto {
    @Field(isLowercase) v!: string;
  }
  @baker.Recipe
  class UppercaseDto {
    @Field(isUppercase) v!: string;
  }
  @baker.Recipe
  class AsciiDto {
    @Field(isAscii) v!: string;
  }
  @baker.Recipe
  class AlphaDto {
    @Field(isAlpha) v!: string;
  }
  @baker.Recipe
  class AlphanumDto {
    @Field(isAlphanumeric) v!: string;
  }
  @baker.Recipe
  class NumStrDto {
    @Field(isNumberString()) v!: string;
  }
  @baker.Recipe
  class DecimalDto {
    @Field(isDecimal()) v!: string;
  }
  @baker.Recipe
  class BoolStrDto {
    @Field(isBooleanString) v!: string;
  }
  @baker.Recipe
  class JsonDto {
    @Field(isJSON) v!: string;
  }
  @baker.Recipe
  class EmailDto {
    @Field(isEmail()) v!: string;
  }
  @baker.Recipe
  class UrlDto {
    @Field(isURL()) v!: string;
  }
  @baker.Recipe
  class UuidDto {
    @Field(isUUID()) v!: string;
  }
  @baker.Recipe
  class IpDto {
    @Field(isIP()) v!: string;
  }
  @baker.Recipe
  class Iso8601Dto {
    @Field(isISO8601()) v!: string;
  }
  @baker.Recipe
  class HexColorDto {
    @Field(isHexColor) v!: string;
  }
  @baker.Recipe
  class SemVerDto {
    @Field(isSemVer) v!: string;
  }
  @baker.Recipe
  class MongoIdDto {
    @Field(isMongoId) v!: string;
  }
  @baker.Recipe
  class CreditCardDto {
    @Field(isCreditCard) v!: string;
  }
  @baker.Recipe
  class PortDto {
    @Field(isPort) v!: string;
  }
  @baker.Recipe
  class FqdnDto {
    @Field(isFQDN()) v!: string;
  }

  it('minLength', async () => {
    expect(await getErrorCode(MinLenDto, { v: 'ab' })).toBe('minLength');
  });
  it('maxLength', async () => {
    expect(await getErrorCode(MaxLenDto, { v: 'abcdef' })).toBe('maxLength');
  });
  it('length', async () => {
    expect(await getErrorCode(LenDto, { v: 'a' })).toBe('length');
  });
  it('contains', async () => {
    expect(await getErrorCode(ContainsDto, { v: 'bar' })).toBe('contains');
  });
  it('notContains', async () => {
    expect(await getErrorCode(NotContainsDto, { v: 'bar' })).toBe('notContains');
  });
  it('matches', async () => {
    expect(await getErrorCode(MatchesDto, { v: 'abc' })).toBe('matches');
  });
  it('isLowercase', async () => {
    expect(await getErrorCode(LowercaseDto, { v: 'ABC' })).toBe('isLowercase');
  });
  it('isUppercase', async () => {
    expect(await getErrorCode(UppercaseDto, { v: 'abc' })).toBe('isUppercase');
  });
  it('isAscii', async () => {
    expect(await getErrorCode(AsciiDto, { v: '한글' })).toBe('isAscii');
  });
  it('isAlpha', async () => {
    expect(await getErrorCode(AlphaDto, { v: 'abc123' })).toBe('isAlpha');
  });
  it('isAlphanumeric', async () => {
    expect(await getErrorCode(AlphanumDto, { v: 'abc-' })).toBe('isAlphanumeric');
  });
  it('isNumberString', async () => {
    expect(await getErrorCode(NumStrDto, { v: 'abc' })).toBe('isNumberString');
  });
  it('isDecimal', async () => {
    expect(await getErrorCode(DecimalDto, { v: 'abc' })).toBe('isDecimal');
  });
  it('isBooleanString', async () => {
    expect(await getErrorCode(BoolStrDto, { v: 'maybe' })).toBe('isBooleanString');
  });
  it('isJSON', async () => {
    expect(await getErrorCode(JsonDto, { v: '{bad' })).toBe('isJSON');
  });
  it('isEmail', async () => {
    expect(await getErrorCode(EmailDto, { v: 'nope' })).toBe('isEmail');
  });
  it('isURL', async () => {
    expect(await getErrorCode(UrlDto, { v: 'nope' })).toBe('isURL');
  });
  it('isUUID', async () => {
    expect(await getErrorCode(UuidDto, { v: 'nope' })).toBe('isUUID');
  });
  it('isIP', async () => {
    expect(await getErrorCode(IpDto, { v: 'nope' })).toBe('isIP');
  });
  it('isISO8601', async () => {
    expect(await getErrorCode(Iso8601Dto, { v: 'nope' })).toBe('isISO8601');
  });
  it('isHexColor', async () => {
    expect(await getErrorCode(HexColorDto, { v: 'nope' })).toBe('isHexColor');
  });
  it('isSemVer', async () => {
    expect(await getErrorCode(SemVerDto, { v: 'nope' })).toBe('isSemVer');
  });
  it('isMongoId', async () => {
    expect(await getErrorCode(MongoIdDto, { v: 'nope' })).toBe('isMongoId');
  });
  it('isCreditCard', async () => {
    expect(await getErrorCode(CreditCardDto, { v: 'nope' })).toBe('isCreditCard');
  });
  it('isPort', async () => {
    expect(await getErrorCode(PortDto, { v: '99999' })).toBe('isPort');
  });
  it('isFQDN', async () => {
    expect(await getErrorCode(FqdnDto, { v: 'x' })).toBe('isFQDN');
  });
});

// ─── date decorator error codes ──────────────────────────────────────────

describe('date decorator error codes', () => {
  const now = new Date();
  const past = new Date('2000-01-01');
  const future = new Date('2100-01-01');
  @baker.Recipe
  class MinDateDto {
    @Field(minDate(future)) v!: Date;
  }
  @baker.Recipe
  class MaxDateDto {
    @Field(maxDate(past)) v!: Date;
  }

  it('minDate', async () => {
    expect(await getErrorCode(MinDateDto, { v: now })).toBe('minDate');
  });
  it('maxDate', async () => {
    expect(await getErrorCode(MaxDateDto, { v: now })).toBe('maxDate');
  });
});

// ─── array decorator error codes ──────────────────────────────────────────

describe('array decorator error codes', () => {
  @baker.Recipe
  class ArrMinDto {
    @Field(arrayMinSize(3)) v!: number[];
  }
  @baker.Recipe
  class ArrMaxDto {
    @Field(arrayMaxSize(2)) v!: number[];
  }
  @baker.Recipe
  class ArrUniqueDto {
    @Field(arrayUnique()) v!: number[];
  }
  @baker.Recipe
  class ArrNotEmptyDto {
    @Field(arrayNotEmpty) v!: number[];
  }
  @baker.Recipe
  class ArrContainsDto {
    @Field(arrayContains([1, 2])) v!: number[];
  }
  @baker.Recipe
  class ArrNotContainsDto {
    @Field(arrayNotContains([99])) v!: number[];
  }

  it('arrayMinSize', async () => {
    expect(await getErrorCode(ArrMinDto, { v: [1] })).toBe('arrayMinSize');
  });
  it('arrayMaxSize', async () => {
    expect(await getErrorCode(ArrMaxDto, { v: [1, 2, 3] })).toBe('arrayMaxSize');
  });
  it('arrayUnique', async () => {
    expect(await getErrorCode(ArrUniqueDto, { v: [1, 1] })).toBe('arrayUnique');
  });
  it('arrayNotEmpty', async () => {
    expect(await getErrorCode(ArrNotEmptyDto, { v: [] })).toBe('arrayNotEmpty');
  });
  it('arrayContains', async () => {
    expect(await getErrorCode(ArrContainsDto, { v: [1] })).toBe('arrayContains');
  });
  it('arrayNotContains', async () => {
    expect(await getErrorCode(ArrNotContainsDto, { v: [99] })).toBe('arrayNotContains');
  });
});

// ─── object decorator error codes ──────────────────────────────────────────

describe('object decorator error codes', () => {
  @baker.Recipe
  class NotEmptyObjDto {
    @Field(isNotEmptyObject()) v!: object;
  }
  @baker.Recipe
  class InstanceDto {
    @Field(isInstance(Date)) v!: Date;
  }

  it('isNotEmptyObject', async () => {
    expect(await getErrorCode(NotEmptyObjDto, { v: {} })).toBe('isNotEmptyObject');
  });
  it('isInstance', async () => {
    expect(await getErrorCode(InstanceDto, { v: {} })).toBe('isInstance');
  });
});

// ─── reserved error codes ─────────────────────────────────────────────────

describe('reserved error codes', () => {
  @baker.Recipe
  class SimpleDto {
    @Field(isString) v!: string;
  }

  it('invalidInput (null)', async () => {
    expect(await getErrorCode(SimpleDto, null, '')).toBe('invalidInput');
  });
  it('invalidInput (undefined)', async () => {
    expect(await getErrorCode(SimpleDto, undefined, '')).toBe('invalidInput');
  });
  it('invalidInput (array)', async () => {
    expect(await getErrorCode(SimpleDto, [1, 2], '')).toBe('invalidInput');
  });
  it('invalidInput (string)', async () => {
    expect(await getErrorCode(SimpleDto, 'hello', '')).toBe('invalidInput');
  });
  it('invalidInput (number)', async () => {
    expect(await getErrorCode(SimpleDto, 42, '')).toBe('invalidInput');
  });
  it('invalidInput (boolean)', async () => {
    expect(await getErrorCode(SimpleDto, true, '')).toBe('invalidInput');
  });
});
