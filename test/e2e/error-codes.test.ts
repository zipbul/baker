import { describe, it, expect, afterEach } from 'bun:test';
import {
  seal, deserialize, BakerValidationError,
  IsString, IsNumber, IsBoolean, IsDate, IsEnum, IsInt, IsArray, IsObject,
  IsDefined, IsOptional, Equals, NotEquals, IsIn, IsNotIn, IsEmpty, IsNotEmpty,
  Min, Max, IsPositive, IsNegative, IsDivisibleBy,
  MinLength, MaxLength, Length, Contains, NotContains, Matches,
  IsEmail, IsURL, IsUUID, IsIP, IsISO8601,
  ArrayMinSize, ArrayMaxSize, ArrayUnique, ArrayNotEmpty, ArrayContains, ArrayNotContains,
  IsNotEmptyObject, IsInstance,
  IsLowercase, IsUppercase, IsAscii, IsAlpha, IsAlphanumeric,
  IsNumberString, IsDecimal, IsBooleanString, IsJSON,
  MinDate, MaxDate,
  IsHexColor, IsSemVer, IsMongoId, IsCreditCard, IsPort, IsFQDN,
} from '../../index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

/** 헬퍼: BakerValidationError에서 특정 path의 code를 추출 */
async function getErrorCode(cls: Function, input: unknown, path?: string): Promise<string> {
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

// ─── 타입 체커 에러 코드 ────────────────────────────────────────────────────

describe('타입 체커 에러 코드', () => {
  class StringDto { @IsString() v!: string; }
  class NumberDto { @IsNumber() v!: number; }
  class BooleanDto { @IsBoolean() v!: boolean; }
  class DateDto { @IsDate() v!: Date; }
  class IntDto { @IsInt() v!: number; }
  class ArrayDto { @IsArray() v!: unknown[]; }
  class ObjectDto { @IsObject() v!: object; }
  enum Color { Red = 'red', Blue = 'blue' }
  class EnumDto { @IsEnum(Color) v!: Color; }

  it('isString', async () => { seal(); expect(await getErrorCode(StringDto, { v: 123 })).toBe('isString'); });
  it('isNumber', async () => { seal(); expect(await getErrorCode(NumberDto, { v: 'abc' })).toBe('isNumber'); });
  it('isBoolean', async () => { seal(); expect(await getErrorCode(BooleanDto, { v: 'true' })).toBe('isBoolean'); });
  it('isDate', async () => { seal(); expect(await getErrorCode(DateDto, { v: 'not-a-date' })).toBe('isDate'); });
  it('isInt', async () => { seal(); expect(await getErrorCode(IntDto, { v: 1.5 })).toBe('isInt'); });
  it('isArray', async () => { seal(); expect(await getErrorCode(ArrayDto, { v: 'notarray' })).toBe('isArray'); });
  it('isObject', async () => { seal(); expect(await getErrorCode(ObjectDto, { v: 'notobj' })).toBe('isObject'); });
  it('isEnum', async () => { seal(); expect(await getErrorCode(EnumDto, { v: 'green' })).toBe('isEnum'); });
});

// ─── 공통 데코레이터 에러 코드 ──────────────────────────────────────────────

describe('공통 데코레이터 에러 코드', () => {
  class DefinedDto { @IsDefined() v!: string; }
  class EqualsDto { @Equals('yes') v!: string; }
  class NotEqualsDto { @NotEquals('no') v!: string; }
  class IsInDto { @IsIn(['a', 'b']) v!: string; }
  class IsNotInDto { @IsNotIn(['x']) v!: string; }
  class EmptyDto { @IsEmpty() v!: string; }
  class NotEmptyDto { @IsNotEmpty() v!: string; }

  it('isDefined', async () => { seal(); expect(await getErrorCode(DefinedDto, {})).toBe('isDefined'); });
  it('equals', async () => { seal(); expect(await getErrorCode(EqualsDto, { v: 'no' })).toBe('equals'); });
  it('notEquals', async () => { seal(); expect(await getErrorCode(NotEqualsDto, { v: 'no' })).toBe('notEquals'); });
  it('isIn', async () => { seal(); expect(await getErrorCode(IsInDto, { v: 'c' })).toBe('isIn'); });
  it('isNotIn', async () => { seal(); expect(await getErrorCode(IsNotInDto, { v: 'x' })).toBe('isNotIn'); });
  it('isEmpty', async () => { seal(); expect(await getErrorCode(EmptyDto, { v: 'something' })).toBe('isEmpty'); });
  it('isNotEmpty', async () => { seal(); expect(await getErrorCode(NotEmptyDto, { v: '' })).toBe('isNotEmpty'); });
});

// ─── 숫자 데코레이터 에러 코드 ──────────────────────────────────────────────

describe('숫자 데코레이터 에러 코드', () => {
  class MinDto { @Min(5) v!: number; }
  class MaxDto { @Max(10) v!: number; }
  class PositiveDto { @IsPositive() v!: number; }
  class NegativeDto { @IsNegative() v!: number; }
  class DivisibleDto { @IsDivisibleBy(3) v!: number; }

  it('min', async () => { seal(); expect(await getErrorCode(MinDto, { v: 2 })).toBe('min'); });
  it('max', async () => { seal(); expect(await getErrorCode(MaxDto, { v: 15 })).toBe('max'); });
  it('isPositive', async () => { seal(); expect(await getErrorCode(PositiveDto, { v: -1 })).toBe('isPositive'); });
  it('isNegative', async () => { seal(); expect(await getErrorCode(NegativeDto, { v: 1 })).toBe('isNegative'); });
  it('isDivisibleBy', async () => { seal(); expect(await getErrorCode(DivisibleDto, { v: 4 })).toBe('isDivisibleBy'); });
});

// ─── 문자열 데코레이터 에러 코드 ────────────────────────────────────────────

describe('문자열 데코레이터 에러 코드', () => {
  class MinLenDto { @MinLength(3) v!: string; }
  class MaxLenDto { @MaxLength(5) v!: string; }
  class LenDto { @Length(2, 4) v!: string; }
  class ContainsDto { @Contains('foo') v!: string; }
  class NotContainsDto { @NotContains('bar') v!: string; }
  class MatchesDto { @Matches(/^\d+$/) v!: string; }
  class LowercaseDto { @IsLowercase() v!: string; }
  class UppercaseDto { @IsUppercase() v!: string; }
  class AsciiDto { @IsAscii() v!: string; }
  class AlphaDto { @IsAlpha() v!: string; }
  class AlphanumDto { @IsAlphanumeric() v!: string; }
  class NumStrDto { @IsNumberString() v!: string; }
  class DecimalDto { @IsDecimal() v!: string; }
  class BoolStrDto { @IsBooleanString() v!: string; }
  class JsonDto { @IsJSON() v!: string; }
  class EmailDto { @IsEmail() v!: string; }
  class UrlDto { @IsURL() v!: string; }
  class UuidDto { @IsUUID() v!: string; }
  class IpDto { @IsIP() v!: string; }
  class Iso8601Dto { @IsISO8601() v!: string; }
  class HexColorDto { @IsHexColor() v!: string; }
  class SemVerDto { @IsSemVer() v!: string; }
  class MongoIdDto { @IsMongoId() v!: string; }
  class CreditCardDto { @IsCreditCard() v!: string; }
  class PortDto { @IsPort() v!: string; }
  class FqdnDto { @IsFQDN() v!: string; }

  it('minLength', async () => { seal(); expect(await getErrorCode(MinLenDto, { v: 'ab' })).toBe('minLength'); });
  it('maxLength', async () => { seal(); expect(await getErrorCode(MaxLenDto, { v: 'abcdef' })).toBe('maxLength'); });
  it('length', async () => { seal(); expect(await getErrorCode(LenDto, { v: 'a' })).toBe('length'); });
  it('contains', async () => { seal(); expect(await getErrorCode(ContainsDto, { v: 'bar' })).toBe('contains'); });
  it('notContains', async () => { seal(); expect(await getErrorCode(NotContainsDto, { v: 'bar' })).toBe('notContains'); });
  it('matches', async () => { seal(); expect(await getErrorCode(MatchesDto, { v: 'abc' })).toBe('matches'); });
  it('isLowercase', async () => { seal(); expect(await getErrorCode(LowercaseDto, { v: 'ABC' })).toBe('isLowercase'); });
  it('isUppercase', async () => { seal(); expect(await getErrorCode(UppercaseDto, { v: 'abc' })).toBe('isUppercase'); });
  it('isAscii', async () => { seal(); expect(await getErrorCode(AsciiDto, { v: '한글' })).toBe('isAscii'); });
  it('isAlpha', async () => { seal(); expect(await getErrorCode(AlphaDto, { v: 'abc123' })).toBe('isAlpha'); });
  it('isAlphanumeric', async () => { seal(); expect(await getErrorCode(AlphanumDto, { v: 'abc-' })).toBe('isAlphanumeric'); });
  it('isNumberString', async () => { seal(); expect(await getErrorCode(NumStrDto, { v: 'abc' })).toBe('isNumberString'); });
  it('isDecimal', async () => { seal(); expect(await getErrorCode(DecimalDto, { v: 'abc' })).toBe('isDecimal'); });
  it('isBooleanString', async () => { seal(); expect(await getErrorCode(BoolStrDto, { v: 'maybe' })).toBe('isBooleanString'); });
  it('isJSON', async () => { seal(); expect(await getErrorCode(JsonDto, { v: '{bad' })).toBe('isJSON'); });
  it('isEmail', async () => { seal(); expect(await getErrorCode(EmailDto, { v: 'nope' })).toBe('isEmail'); });
  it('isURL', async () => { seal(); expect(await getErrorCode(UrlDto, { v: 'nope' })).toBe('isURL'); });
  it('isUUID', async () => { seal(); expect(await getErrorCode(UuidDto, { v: 'nope' })).toBe('isUUID'); });
  it('isIP', async () => { seal(); expect(await getErrorCode(IpDto, { v: 'nope' })).toBe('isIP'); });
  it('isISO8601', async () => { seal(); expect(await getErrorCode(Iso8601Dto, { v: 'nope' })).toBe('isISO8601'); });
  it('isHexColor', async () => { seal(); expect(await getErrorCode(HexColorDto, { v: 'nope' })).toBe('isHexColor'); });
  it('isSemVer', async () => { seal(); expect(await getErrorCode(SemVerDto, { v: 'nope' })).toBe('isSemVer'); });
  it('isMongoId', async () => { seal(); expect(await getErrorCode(MongoIdDto, { v: 'nope' })).toBe('isMongoId'); });
  it('isCreditCard', async () => { seal(); expect(await getErrorCode(CreditCardDto, { v: 'nope' })).toBe('isCreditCard'); });
  it('isPort', async () => { seal(); expect(await getErrorCode(PortDto, { v: '99999' })).toBe('isPort'); });
  it('isFQDN', async () => { seal(); expect(await getErrorCode(FqdnDto, { v: 'x' })).toBe('isFQDN'); });
});

// ─── 날짜 데코레이터 에러 코드 ──────────────────────────────────────────────

describe('날짜 데코레이터 에러 코드', () => {
  const now = new Date();
  const past = new Date('2000-01-01');
  const future = new Date('2100-01-01');
  class MinDateDto { @MinDate(future) v!: Date; }
  class MaxDateDto { @MaxDate(past) v!: Date; }

  it('minDate', async () => { seal(); expect(await getErrorCode(MinDateDto, { v: now })).toBe('minDate'); });
  it('maxDate', async () => { seal(); expect(await getErrorCode(MaxDateDto, { v: now })).toBe('maxDate'); });
});

// ─── 배열 데코레이터 에러 코드 ──────────────────────────────────────────────

describe('배열 데코레이터 에러 코드', () => {
  class ArrMinDto { @ArrayMinSize(3) v!: number[]; }
  class ArrMaxDto { @ArrayMaxSize(2) v!: number[]; }
  class ArrUniqueDto { @ArrayUnique() v!: number[]; }
  class ArrNotEmptyDto { @ArrayNotEmpty() v!: number[]; }
  class ArrContainsDto { @ArrayContains([1, 2]) v!: number[]; }
  class ArrNotContainsDto { @ArrayNotContains([99]) v!: number[]; }

  it('arrayMinSize', async () => { seal(); expect(await getErrorCode(ArrMinDto, { v: [1] })).toBe('arrayMinSize'); });
  it('arrayMaxSize', async () => { seal(); expect(await getErrorCode(ArrMaxDto, { v: [1, 2, 3] })).toBe('arrayMaxSize'); });
  it('arrayUnique', async () => { seal(); expect(await getErrorCode(ArrUniqueDto, { v: [1, 1] })).toBe('arrayUnique'); });
  it('arrayNotEmpty', async () => { seal(); expect(await getErrorCode(ArrNotEmptyDto, { v: [] })).toBe('arrayNotEmpty'); });
  it('arrayContains', async () => { seal(); expect(await getErrorCode(ArrContainsDto, { v: [1] })).toBe('arrayContains'); });
  it('arrayNotContains', async () => { seal(); expect(await getErrorCode(ArrNotContainsDto, { v: [99] })).toBe('arrayNotContains'); });
});

// ─── 객체 데코레이터 에러 코드 ──────────────────────────────────────────────

describe('객체 데코레이터 에러 코드', () => {
  class NotEmptyObjDto { @IsNotEmptyObject() v!: object; }
  class InstanceDto { @IsInstance(Date) v!: Date; }

  it('isNotEmptyObject', async () => { seal(); expect(await getErrorCode(NotEmptyObjDto, { v: {} })).toBe('isNotEmptyObject'); });
  it('isInstance', async () => { seal(); expect(await getErrorCode(InstanceDto, { v: {} })).toBe('isInstance'); });
});

// ─── 예약 에러 코드 ─────────────────────────────────────────────────────────

describe('예약 에러 코드', () => {
  class SimpleDto { @IsString() v!: string; }

  it('invalidInput (null)', async () => { seal(); expect(await getErrorCode(SimpleDto, null, '')).toBe('invalidInput'); });
  it('invalidInput (undefined)', async () => { seal(); expect(await getErrorCode(SimpleDto, undefined, '')).toBe('invalidInput'); });
  it('invalidInput (array)', async () => { seal(); expect(await getErrorCode(SimpleDto, [1, 2], '')).toBe('invalidInput'); });
  it('invalidInput (string)', async () => { seal(); expect(await getErrorCode(SimpleDto, 'hello', '')).toBe('invalidInput'); });
  it('invalidInput (number)', async () => { seal(); expect(await getErrorCode(SimpleDto, 42, '')).toBe('invalidInput'); });
  it('invalidInput (boolean)', async () => { seal(); expect(await getErrorCode(SimpleDto, true, '')).toBe('invalidInput'); });
});
