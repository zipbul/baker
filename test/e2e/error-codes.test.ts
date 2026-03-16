import { describe, it, expect, afterEach } from 'bun:test';
import { Field, deserialize, BakerValidationError } from '../../index';
import {
  isString, isNumber, isBoolean, isDate, isEnum, isInt, isArray, isObject,
  equals, notEquals, isIn, isNotIn, isEmpty, isNotEmpty,
  min, max, isPositive, isNegative, isDivisibleBy,
  minLength, maxLength, length, contains, notContains, matches,
  isEmail, isURL, isUUID, isIP, isISO8601,
  arrayMinSize, arrayMaxSize, arrayUnique, arrayNotEmpty, arrayContains, arrayNotContains,
  isNotEmptyObject, isInstance,
  isLowercase, isUppercase, isAscii, isAlpha, isAlphanumeric,
  isNumberString, isDecimal, isBooleanString, isJSON,
  minDate, maxDate,
  isHexColor, isSemVer, isMongoId, isCreditCard, isPort, isFQDN,
} from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

/** Helper: extracts the error code for a specific path from BakerValidationError */
async function getErrorCode(cls: new (...args: any[]) => any, input: unknown, path?: string): Promise<string> {
  try {
    await deserialize(cls, input);
    throw new Error('expected rejection');
  } catch (e) {
    if (!(e instanceof BakerValidationError)) throw e;
    const err = path !== undefined
      ? e.errors.find(x => x.path === path)
      : e.errors[0];
    if (!err) throw new Error(`no error at path="${path}", got: ${JSON.stringify(e.errors)}`);
    return err.code;
  }
}

// ─── type checker error codes ────────────────────────────────────────────────

describe('type checker error codes', () => {
  class StringDto { @Field(isString) v!: string; }
  class NumberDto { @Field(isNumber()) v!: number; }
  class BooleanDto { @Field(isBoolean) v!: boolean; }
  class DateDto { @Field(isDate) v!: Date; }
  class IntDto { @Field(isInt) v!: number; }
  class ArrayDto { @Field(isArray) v!: unknown[]; }
  class ObjectDto { @Field(isObject) v!: object; }
  enum Color { Red = 'red', Blue = 'blue' }
  class EnumDto { @Field(isEnum(Color)) v!: Color; }

  it('isString', async () => { expect(await getErrorCode(StringDto, { v: 123 })).toBe('isString'); });
  it('isNumber', async () => { expect(await getErrorCode(NumberDto, { v: 'abc' })).toBe('isNumber'); });
  it('isBoolean', async () => { expect(await getErrorCode(BooleanDto, { v: 'true' })).toBe('isBoolean'); });
  it('isDate', async () => { expect(await getErrorCode(DateDto, { v: 'not-a-date' })).toBe('isDate'); });
  it('isInt', async () => { expect(await getErrorCode(IntDto, { v: 1.5 })).toBe('isInt'); });
  it('isArray', async () => { expect(await getErrorCode(ArrayDto, { v: 'notarray' })).toBe('isArray'); });
  it('isObject', async () => { expect(await getErrorCode(ObjectDto, { v: 'notobj' })).toBe('isObject'); });
  it('isEnum', async () => { expect(await getErrorCode(EnumDto, { v: 'green' })).toBe('isEnum'); });
});

// ─── common decorator error codes ──────────────────────────────────────────

describe('common decorator error codes', () => {
  class DefinedDto { @Field() v!: string; }
  class EqualsDto { @Field(equals('yes')) v!: string; }
  class NotEqualsDto { @Field(notEquals('no')) v!: string; }
  class IsInDto { @Field(isIn(['a', 'b'])) v!: string; }
  class IsNotInDto { @Field(isNotIn(['x'])) v!: string; }
  class EmptyDto { @Field(isEmpty) v!: string; }
  class NotEmptyDto { @Field(isNotEmpty) v!: string; }

  it('isDefined', async () => { expect(await getErrorCode(DefinedDto, {})).toBe('isDefined'); });
  it('equals', async () => { expect(await getErrorCode(EqualsDto, { v: 'no' })).toBe('equals'); });
  it('notEquals', async () => { expect(await getErrorCode(NotEqualsDto, { v: 'no' })).toBe('notEquals'); });
  it('isIn', async () => { expect(await getErrorCode(IsInDto, { v: 'c' })).toBe('isIn'); });
  it('isNotIn', async () => { expect(await getErrorCode(IsNotInDto, { v: 'x' })).toBe('isNotIn'); });
  it('isEmpty', async () => { expect(await getErrorCode(EmptyDto, { v: 'something' })).toBe('isEmpty'); });
  it('isNotEmpty', async () => { expect(await getErrorCode(NotEmptyDto, { v: '' })).toBe('isNotEmpty'); });
});

// ─── number decorator error codes ──────────────────────────────────────────

describe('number decorator error codes', () => {
  class MinDto { @Field(min(5)) v!: number; }
  class MaxDto { @Field(max(10)) v!: number; }
  class PositiveDto { @Field(isPositive) v!: number; }
  class NegativeDto { @Field(isNegative) v!: number; }
  class DivisibleDto { @Field(isDivisibleBy(3)) v!: number; }

  it('min', async () => { expect(await getErrorCode(MinDto, { v: 2 })).toBe('min'); });
  it('max', async () => { expect(await getErrorCode(MaxDto, { v: 15 })).toBe('max'); });
  it('isPositive', async () => { expect(await getErrorCode(PositiveDto, { v: -1 })).toBe('isPositive'); });
  it('isNegative', async () => { expect(await getErrorCode(NegativeDto, { v: 1 })).toBe('isNegative'); });
  it('isDivisibleBy', async () => { expect(await getErrorCode(DivisibleDto, { v: 4 })).toBe('isDivisibleBy'); });
});

// ─── string decorator error codes ────────────────────────────────────────

describe('string decorator error codes', () => {
  class MinLenDto { @Field(minLength(3)) v!: string; }
  class MaxLenDto { @Field(maxLength(5)) v!: string; }
  class LenDto { @Field(length(2, 4)) v!: string; }
  class ContainsDto { @Field(contains('foo')) v!: string; }
  class NotContainsDto { @Field(notContains('bar')) v!: string; }
  class MatchesDto { @Field(matches(/^\d+$/)) v!: string; }
  class LowercaseDto { @Field(isLowercase) v!: string; }
  class UppercaseDto { @Field(isUppercase) v!: string; }
  class AsciiDto { @Field(isAscii) v!: string; }
  class AlphaDto { @Field(isAlpha) v!: string; }
  class AlphanumDto { @Field(isAlphanumeric) v!: string; }
  class NumStrDto { @Field(isNumberString()) v!: string; }
  class DecimalDto { @Field(isDecimal()) v!: string; }
  class BoolStrDto { @Field(isBooleanString) v!: string; }
  class JsonDto { @Field(isJSON) v!: string; }
  class EmailDto { @Field(isEmail()) v!: string; }
  class UrlDto { @Field(isURL()) v!: string; }
  class UuidDto { @Field(isUUID()) v!: string; }
  class IpDto { @Field(isIP()) v!: string; }
  class Iso8601Dto { @Field(isISO8601()) v!: string; }
  class HexColorDto { @Field(isHexColor) v!: string; }
  class SemVerDto { @Field(isSemVer) v!: string; }
  class MongoIdDto { @Field(isMongoId) v!: string; }
  class CreditCardDto { @Field(isCreditCard) v!: string; }
  class PortDto { @Field(isPort) v!: string; }
  class FqdnDto { @Field(isFQDN()) v!: string; }

  it('minLength', async () => { expect(await getErrorCode(MinLenDto, { v: 'ab' })).toBe('minLength'); });
  it('maxLength', async () => { expect(await getErrorCode(MaxLenDto, { v: 'abcdef' })).toBe('maxLength'); });
  it('length', async () => { expect(await getErrorCode(LenDto, { v: 'a' })).toBe('length'); });
  it('contains', async () => { expect(await getErrorCode(ContainsDto, { v: 'bar' })).toBe('contains'); });
  it('notContains', async () => { expect(await getErrorCode(NotContainsDto, { v: 'bar' })).toBe('notContains'); });
  it('matches', async () => { expect(await getErrorCode(MatchesDto, { v: 'abc' })).toBe('matches'); });
  it('isLowercase', async () => { expect(await getErrorCode(LowercaseDto, { v: 'ABC' })).toBe('isLowercase'); });
  it('isUppercase', async () => { expect(await getErrorCode(UppercaseDto, { v: 'abc' })).toBe('isUppercase'); });
  it('isAscii', async () => { expect(await getErrorCode(AsciiDto, { v: '한글' })).toBe('isAscii'); });
  it('isAlpha', async () => { expect(await getErrorCode(AlphaDto, { v: 'abc123' })).toBe('isAlpha'); });
  it('isAlphanumeric', async () => { expect(await getErrorCode(AlphanumDto, { v: 'abc-' })).toBe('isAlphanumeric'); });
  it('isNumberString', async () => { expect(await getErrorCode(NumStrDto, { v: 'abc' })).toBe('isNumberString'); });
  it('isDecimal', async () => { expect(await getErrorCode(DecimalDto, { v: 'abc' })).toBe('isDecimal'); });
  it('isBooleanString', async () => { expect(await getErrorCode(BoolStrDto, { v: 'maybe' })).toBe('isBooleanString'); });
  it('isJSON', async () => { expect(await getErrorCode(JsonDto, { v: '{bad' })).toBe('isJSON'); });
  it('isEmail', async () => { expect(await getErrorCode(EmailDto, { v: 'nope' })).toBe('isEmail'); });
  it('isURL', async () => { expect(await getErrorCode(UrlDto, { v: 'nope' })).toBe('isURL'); });
  it('isUUID', async () => { expect(await getErrorCode(UuidDto, { v: 'nope' })).toBe('isUUID'); });
  it('isIP', async () => { expect(await getErrorCode(IpDto, { v: 'nope' })).toBe('isIP'); });
  it('isISO8601', async () => { expect(await getErrorCode(Iso8601Dto, { v: 'nope' })).toBe('isISO8601'); });
  it('isHexColor', async () => { expect(await getErrorCode(HexColorDto, { v: 'nope' })).toBe('isHexColor'); });
  it('isSemVer', async () => { expect(await getErrorCode(SemVerDto, { v: 'nope' })).toBe('isSemVer'); });
  it('isMongoId', async () => { expect(await getErrorCode(MongoIdDto, { v: 'nope' })).toBe('isMongoId'); });
  it('isCreditCard', async () => { expect(await getErrorCode(CreditCardDto, { v: 'nope' })).toBe('isCreditCard'); });
  it('isPort', async () => { expect(await getErrorCode(PortDto, { v: '99999' })).toBe('isPort'); });
  it('isFQDN', async () => { expect(await getErrorCode(FqdnDto, { v: 'x' })).toBe('isFQDN'); });
});

// ─── date decorator error codes ──────────────────────────────────────────

describe('date decorator error codes', () => {
  const now = new Date();
  const past = new Date('2000-01-01');
  const future = new Date('2100-01-01');
  class MinDateDto { @Field(minDate(future)) v!: Date; }
  class MaxDateDto { @Field(maxDate(past)) v!: Date; }

  it('minDate', async () => { expect(await getErrorCode(MinDateDto, { v: now })).toBe('minDate'); });
  it('maxDate', async () => { expect(await getErrorCode(MaxDateDto, { v: now })).toBe('maxDate'); });
});

// ─── array decorator error codes ──────────────────────────────────────────

describe('array decorator error codes', () => {
  class ArrMinDto { @Field(arrayMinSize(3)) v!: number[]; }
  class ArrMaxDto { @Field(arrayMaxSize(2)) v!: number[]; }
  class ArrUniqueDto { @Field(arrayUnique()) v!: number[]; }
  class ArrNotEmptyDto { @Field(arrayNotEmpty) v!: number[]; }
  class ArrContainsDto { @Field(arrayContains([1, 2])) v!: number[]; }
  class ArrNotContainsDto { @Field(arrayNotContains([99])) v!: number[]; }

  it('arrayMinSize', async () => { expect(await getErrorCode(ArrMinDto, { v: [1] })).toBe('arrayMinSize'); });
  it('arrayMaxSize', async () => { expect(await getErrorCode(ArrMaxDto, { v: [1, 2, 3] })).toBe('arrayMaxSize'); });
  it('arrayUnique', async () => { expect(await getErrorCode(ArrUniqueDto, { v: [1, 1] })).toBe('arrayUnique'); });
  it('arrayNotEmpty', async () => { expect(await getErrorCode(ArrNotEmptyDto, { v: [] })).toBe('arrayNotEmpty'); });
  it('arrayContains', async () => { expect(await getErrorCode(ArrContainsDto, { v: [1] })).toBe('arrayContains'); });
  it('arrayNotContains', async () => { expect(await getErrorCode(ArrNotContainsDto, { v: [99] })).toBe('arrayNotContains'); });
});

// ─── object decorator error codes ──────────────────────────────────────────

describe('object decorator error codes', () => {
  class NotEmptyObjDto { @Field(isNotEmptyObject()) v!: object; }
  class InstanceDto { @Field(isInstance(Date)) v!: Date; }

  it('isNotEmptyObject', async () => { expect(await getErrorCode(NotEmptyObjDto, { v: {} })).toBe('isNotEmptyObject'); });
  it('isInstance', async () => { expect(await getErrorCode(InstanceDto, { v: {} })).toBe('isInstance'); });
});

// ─── reserved error codes ─────────────────────────────────────────────────

describe('reserved error codes', () => {
  class SimpleDto { @Field(isString) v!: string; }

  it('invalidInput (null)', async () => { expect(await getErrorCode(SimpleDto, null, '')).toBe('invalidInput'); });
  it('invalidInput (undefined)', async () => { expect(await getErrorCode(SimpleDto, undefined, '')).toBe('invalidInput'); });
  it('invalidInput (array)', async () => { expect(await getErrorCode(SimpleDto, [1, 2], '')).toBe('invalidInput'); });
  it('invalidInput (string)', async () => { expect(await getErrorCode(SimpleDto, 'hello', '')).toBe('invalidInput'); });
  it('invalidInput (number)', async () => { expect(await getErrorCode(SimpleDto, 42, '')).toBe('invalidInput'); });
  it('invalidInput (boolean)', async () => { expect(await getErrorCode(SimpleDto, true, '')).toBe('invalidInput'); });
});
