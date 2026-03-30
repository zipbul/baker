import { describe, it, expect, afterEach } from 'bun:test';
import { getMeta, Field } from '../../index';
import {
  isNumber,
  min, max, minLength, maxLength, length, matches, contains, notContains,
  isIn, isNotIn, equals, notEquals,
  isEmail, isURL, isUUID, isIP, isISO8601,
  arrayMinSize, arrayMaxSize, arrayContains, arrayNotContains,
  isDivisibleBy, isPositive, isNegative,
  isNotEmptyObject, isInstance,
  minDate, maxDate,
  isMobilePhone, isPostalCode, isIdentityCard, isPassportNumber,
  isNumberString, isRgbColor, isMACAddress, isISBN, isISSN, isFQDN,
  isBase64, isIBAN, isByteLength, isHash,
} from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

function getConstraints(Class: Function, field: string, ruleName: string): Record<string, unknown> {
  const meta = getMeta(Class);
  const rule = meta[field]!.validation.find(r => r.rule.ruleName === ruleName);
  return rule!.rule.constraints ?? {};
}

// ─────────────────────────────────────────────────────────────────────────────
// Number rules
// ─────────────────────────────────────────────────────────────────────────────

describe('getMeta constraints — number rules', () => {
  class D {
    @Field(min(5)) a!: number;
    @Field(max(10)) b!: number;
    @Field(min(0, { exclusive: true })) c!: number;
    @Field(max(100, { exclusive: true })) d!: number;
    @Field(isPositive) e!: number;
    @Field(isNegative) f!: number;
    @Field(isDivisibleBy(3)) g!: number;
    @Field(isNumber({ allowNaN: true, maxDecimalPlaces: 2 })) h!: number;
  }

  it('min → { min: 5 }', () => expect(getConstraints(D, 'a', 'min')).toEqual({ min: 5 }));
  it('max → { max: 10 }', () => expect(getConstraints(D, 'b', 'max')).toEqual({ max: 10 }));
  it('min exclusive → { min: 0, exclusive: true }', () => expect(getConstraints(D, 'c', 'min')).toEqual({ min: 0, exclusive: true }));
  it('max exclusive → { max: 100, exclusive: true }', () => expect(getConstraints(D, 'd', 'max')).toEqual({ max: 100, exclusive: true }));
  it('isPositive → { min: 0, exclusive: true }', () => expect(getConstraints(D, 'e', 'isPositive')).toEqual({ min: 0, exclusive: true }));
  it('isNegative → { max: 0, exclusive: true }', () => expect(getConstraints(D, 'f', 'isNegative')).toEqual({ max: 0, exclusive: true }));
  it('isDivisibleBy → { divisor: 3 }', () => expect(getConstraints(D, 'g', 'isDivisibleBy')).toEqual({ divisor: 3 }));
  it('isNumber options → allowNaN + maxDecimalPlaces', () => {
    const c = getConstraints(D, 'h', 'isNumber');
    expect(c.allowNaN).toBe(true);
    expect(c.maxDecimalPlaces).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// String rules
// ─────────────────────────────────────────────────────────────────────────────

describe('getMeta constraints — string rules', () => {
  class D {
    @Field(minLength(3)) a!: string;
    @Field(maxLength(50)) b!: string;
    @Field(length(2, 10)) c!: string;
    @Field(contains('hello')) d!: string;
    @Field(notContains('bad')) e!: string;
    @Field(matches(/^[a-z]+$/)) f!: string;
  }

  it('minLength → { min: 3 }', () => expect(getConstraints(D, 'a', 'minLength')).toEqual({ min: 3 }));
  it('maxLength → { max: 50 }', () => expect(getConstraints(D, 'b', 'maxLength')).toEqual({ max: 50 }));
  it('length → { min: 2, max: 10 }', () => expect(getConstraints(D, 'c', 'length')).toEqual({ min: 2, max: 10 }));
  it('contains → { seed: "hello" }', () => expect(getConstraints(D, 'd', 'contains')).toEqual({ seed: 'hello' }));
  it('notContains → { seed: "bad" }', () => expect(getConstraints(D, 'e', 'notContains')).toEqual({ seed: 'bad' }));
  it('matches → { pattern }', () => expect(getConstraints(D, 'f', 'matches').pattern).toBe('^[a-z]+$'));
});

// ─────────────────────────────────────────────────────────────────────────────
// Format rules with constraints
// ─────────────────────────────────────────────────────────────────────────────

describe('getMeta constraints — format rules', () => {
  class D {
    @Field(isEmail()) a!: string;
    @Field(isURL()) b!: string;
    @Field(isUUID(4)) c!: string;
    @Field(isIP(6)) d!: string;
    @Field(isISO8601({ strict: true })) e!: string;
  }

  it('isEmail → { format: "email" }', () => expect(getConstraints(D, 'a', 'isEmail')).toEqual({ format: 'email' }));
  it('isURL → format: "uri"', () => expect(getConstraints(D, 'b', 'isURL').format).toBe('uri'));
  it('isUUID(4) → format + version', () => {
    const c = getConstraints(D, 'c', 'isUUID');
    expect(c.format).toBe('uuid');
    expect(c.version).toBe(4);
  });
  it('isIP(6) → { version: 6 }', () => expect(getConstraints(D, 'd', 'isIP').version).toBe(6));
  it('isISO8601 strict → strict: true', () => expect(getConstraints(D, 'e', 'isISO8601').strict).toBe(true));
});

// ─────────────────────────────────────────────────────────────────────────────
// String rules with options (newly fixed constraints)
// ─────────────────────────────────────────────────────────────────────────────

describe('getMeta constraints — string rules with options', () => {
  class D {
    @Field(isNumberString({ no_symbols: true })) a!: string;
    @Field(isRgbColor(true)) b!: string;
    @Field(isMACAddress({ no_separators: true })) c!: string;
    @Field(isISBN(13)) d!: string;
    @Field(isISSN({ requireHyphen: true })) e!: string;
    @Field(isFQDN({ require_tld: false })) f!: string;
    @Field(isBase64({ urlSafe: true })) g!: string;
    @Field(isIBAN({ allowSpaces: true })) h!: string;
    @Field(isByteLength(1, 100)) i!: string;
    @Field(isHash('sha256')) j!: string;
  }

  it('isNumberString → { no_symbols: true }', () => expect(getConstraints(D, 'a', 'isNumberString').no_symbols).toBe(true));
  it('isRgbColor → { includePercentValues: true }', () => expect(getConstraints(D, 'b', 'isRgbColor').includePercentValues).toBe(true));
  it('isMACAddress → { no_separators: true }', () => expect(getConstraints(D, 'c', 'isMACAddress').no_separators).toBe(true));
  it('isISBN → { version: 13 }', () => expect(getConstraints(D, 'd', 'isISBN').version).toBe(13));
  it('isISSN → { requireHyphen: true }', () => expect(getConstraints(D, 'e', 'isISSN').requireHyphen).toBe(true));
  it('isFQDN → { require_tld: false }', () => expect(getConstraints(D, 'f', 'isFQDN').require_tld).toBe(false));
  it('isBase64 → { urlSafe: true }', () => expect(getConstraints(D, 'g', 'isBase64').urlSafe).toBe(true));
  it('isIBAN → { allowSpaces: true }', () => expect(getConstraints(D, 'h', 'isIBAN').allowSpaces).toBe(true));
  it('isByteLength → { min: 1, max: 100 }', () => expect(getConstraints(D, 'i', 'isByteLength')).toEqual({ min: 1, max: 100 }));
  it('isHash → { algorithm: "sha256" }', () => expect(getConstraints(D, 'j', 'isHash')).toEqual({ algorithm: 'sha256' }));
});

// ─────────────────────────────────────────────────────────────────────────────
// Common rules
// ─────────────────────────────────────────────────────────────────────────────

describe('getMeta constraints — common rules', () => {
  class D {
    @Field(equals(42)) a!: number;
    @Field(notEquals('x')) b!: string;
    @Field(isIn([1, 2, 3])) c!: number;
    @Field(isNotIn(['a', 'b'])) d!: string;
  }

  it('equals → { value: 42 }', () => expect(getConstraints(D, 'a', 'equals')).toEqual({ value: 42 }));
  it('notEquals → { value: "x" }', () => expect(getConstraints(D, 'b', 'notEquals')).toEqual({ value: 'x' }));
  it('isIn → { values: [1,2,3] }', () => expect(getConstraints(D, 'c', 'isIn')).toEqual({ values: [1, 2, 3] }));
  it('isNotIn → { values: ["a","b"] }', () => expect(getConstraints(D, 'd', 'isNotIn')).toEqual({ values: ['a', 'b'] }));
});

// ─────────────────────────────────────────────────────────────────────────────
// Array rules
// ─────────────────────────────────────────────────────────────────────────────

describe('getMeta constraints — array rules', () => {
  class D {
    @Field(arrayMinSize(2)) a!: string[];
    @Field(arrayMaxSize(10)) b!: string[];
    @Field(arrayContains([1, 2])) c!: number[];
    @Field(arrayNotContains(['x'])) d!: string[];
  }

  it('arrayMinSize → { min: 2 }', () => expect(getConstraints(D, 'a', 'arrayMinSize')).toEqual({ min: 2 }));
  it('arrayMaxSize → { max: 10 }', () => expect(getConstraints(D, 'b', 'arrayMaxSize')).toEqual({ max: 10 }));
  it('arrayContains → { values: [1,2] }', () => expect(getConstraints(D, 'c', 'arrayContains')).toEqual({ values: [1, 2] }));
  it('arrayNotContains → { values: ["x"] }', () => expect(getConstraints(D, 'd', 'arrayNotContains')).toEqual({ values: ['x'] }));
});

// ─────────────────────────────────────────────────────────────────────────────
// Object rules
// ─────────────────────────────────────────────────────────────────────────────

describe('getMeta constraints — object rules', () => {
  class Foo {}
  class D {
    @Field(isNotEmptyObject({ nullable: true })) a!: object;
    @Field(isInstance(Foo)) b!: Foo;
  }

  it('isNotEmptyObject → { nullable: true }', () => expect(getConstraints(D, 'a', 'isNotEmptyObject')).toEqual({ nullable: true }));
  it('isInstance → { type: "Foo" }', () => expect(getConstraints(D, 'b', 'isInstance')).toEqual({ type: 'Foo' }));
});

// ─────────────────────────────────────────────────────────────────────────────
// Date rules
// ─────────────────────────────────────────────────────────────────────────────

describe('getMeta constraints — date rules', () => {
  const d1 = new Date('2020-01-01');
  const d2 = new Date('2030-12-31');

  class D {
    @Field(minDate(d1)) a!: Date;
    @Field(maxDate(d2)) b!: Date;
  }

  it('minDate → { min: ISO string }', () => expect(getConstraints(D, 'a', 'minDate')).toEqual({ min: d1.toISOString() }));
  it('maxDate → { max: ISO string }', () => expect(getConstraints(D, 'b', 'maxDate')).toEqual({ max: d2.toISOString() }));
});

// ─────────────────────────────────────────────────────────────────────────────
// Locale rules
// ─────────────────────────────────────────────────────────────────────────────

describe('getMeta constraints — locale rules', () => {
  class D {
    @Field(isMobilePhone('ko-KR')) a!: string;
    @Field(isPostalCode('US')) b!: string;
    @Field(isIdentityCard('CN')) c!: string;
    @Field(isPassportNumber('US')) d!: string;
  }

  it('isMobilePhone → { locale: "ko-KR" }', () => expect(getConstraints(D, 'a', 'isMobilePhone')).toEqual({ locale: 'ko-KR' }));
  it('isPostalCode → { locale: "US" }', () => expect(getConstraints(D, 'b', 'isPostalCode')).toEqual({ locale: 'US' }));
  it('isIdentityCard → { locale: "zh-CN" }', () => expect(getConstraints(D, 'c', 'isIdentityCard')).toEqual({ locale: 'CN' }));
  it('isPassportNumber → { locale: "US" }', () => expect(getConstraints(D, 'd', 'isPassportNumber')).toEqual({ locale: 'US' }));
});
