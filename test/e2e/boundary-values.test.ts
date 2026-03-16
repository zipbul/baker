import { describe, it, expect, afterEach } from 'bun:test';
import { Field, deserialize, BakerValidationError } from '../../index';
import {
  isString, isNumber, isBoolean, isInt,
  min, max, isPositive, isNegative, isDivisibleBy,
  minLength, maxLength,
  isPort, isLatitude, isLongitude, isMilitaryTime,
  arrayMinSize, arrayMaxSize,
} from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

/** 헬퍼: 통과 확인 */
async function pass<T>(cls: new (...a: any[]) => T, input: unknown): Promise<T> {
  return deserialize<T>(cls, input);
}

/** 헬퍼: 거부 확인 + 에러 코드 반환 */
async function failCode(cls: new (...args: any[]) => any, input: unknown): Promise<string> {
  try {
    await deserialize(cls, input);
    throw new Error('expected rejection');
  } catch (e) {
    if (!(e instanceof BakerValidationError)) throw e;
    return e.errors[0]!.code;
  }
}

// ─── @IsNumber 경계값 ──────────────────────────────────────────────────────

describe('@IsNumber 경계값', () => {
  class Dto { @Field(isNumber()) v!: number; }

  it('NaN 거부', async () => { expect(await failCode(Dto, { v: NaN })).toBe('isNumber'); });
  it('Infinity 거부', async () => { expect(await failCode(Dto, { v: Infinity })).toBe('isNumber'); });
  it('-Infinity 거부', async () => { expect(await failCode(Dto, { v: -Infinity })).toBe('isNumber'); });
  it('0 통과', async () => { expect((await deserialize<any>(Dto, { v: 0 })).v).toBe(0); });
  it('-0 통과', async () => { expect((await deserialize<any>(Dto, { v: -0 })).v).toBe(-0); });
  it('MAX_SAFE_INTEGER 통과', async () => {
    expect((await deserialize<any>(Dto, { v: Number.MAX_SAFE_INTEGER })).v).toBe(Number.MAX_SAFE_INTEGER);
  });
  it('MIN_SAFE_INTEGER 통과', async () => {
    expect((await deserialize<any>(Dto, { v: Number.MIN_SAFE_INTEGER })).v).toBe(Number.MIN_SAFE_INTEGER);
  });
});

describe('@IsNumber({ allowNaN: true }) NaN 허용', () => {
  class Dto { @Field(isNumber({ allowNaN: true })) v!: number; }
  it('NaN 통과', async () => { const r = await deserialize<any>(Dto, { v: NaN }); expect(isNaN(r.v)).toBe(true); });
});

describe('@IsNumber({ allowInfinity: true }) Infinity 허용', () => {
  class Dto { @Field(isNumber({ allowInfinity: true })) v!: number; }
  it('Infinity 통과', async () => { expect((await deserialize<any>(Dto, { v: Infinity })).v).toBe(Infinity); });
  it('-Infinity 통과', async () => { expect((await deserialize<any>(Dto, { v: -Infinity })).v).toBe(-Infinity); });
});

describe('@IsNumber({ maxDecimalPlaces: 2 }) 소수점 제한', () => {
  class Dto { @Field(isNumber({ maxDecimalPlaces: 2 })) v!: number; }
  it('소수점 2자리 통과', async () => { expect((await deserialize<any>(Dto, { v: 3.14 })).v).toBe(3.14); });
  it('정수 통과', async () => { expect((await deserialize<any>(Dto, { v: 5 })).v).toBe(5); });
  it('소수점 3자리 거부', async () => { expect(await failCode(Dto, { v: 3.141 })).toBe('isNumber'); });
  it('소수점 0자리(정수) 경계', async () => { expect((await deserialize<any>(Dto, { v: 10 })).v).toBe(10); });
});

// ─── @IsPositive / @IsNegative 경계값 ──────────────────────────────────────

describe('@IsPositive 경계값', () => {
  class Dto { @Field(isPositive) v!: number; }
  it('0 거부', async () => { expect(await failCode(Dto, { v: 0 })).toBe('isPositive'); });
  it('0.001 통과', async () => { expect((await deserialize<any>(Dto, { v: 0.001 })).v).toBe(0.001); });
});

describe('@IsNegative 경계값', () => {
  class Dto { @Field(isNegative) v!: number; }
  it('0 거부', async () => { expect(await failCode(Dto, { v: 0 })).toBe('isNegative'); });
  it('-0.001 통과', async () => { expect((await deserialize<any>(Dto, { v: -0.001 })).v).toBe(-0.001); });
});

// ─── @IsInt 경계값 ──────────────────────────────────────────────────────────

describe('@IsInt 경계값', () => {
  class Dto { @Field(isInt) v!: number; }
  it('MAX_SAFE_INTEGER 통과', async () => {
    expect((await deserialize<any>(Dto, { v: Number.MAX_SAFE_INTEGER })).v).toBe(Number.MAX_SAFE_INTEGER);
  });
  it('MIN_SAFE_INTEGER 통과', async () => {
    expect((await deserialize<any>(Dto, { v: Number.MIN_SAFE_INTEGER })).v).toBe(Number.MIN_SAFE_INTEGER);
  });
  it('0.5 거부', async () => { expect(await failCode(Dto, { v: 0.5 })).toBe('isInt'); });
  it('NaN 거부 (typeof check)', async () => { expect(await failCode(Dto, { v: NaN })).toBe('isInt'); });
});

// ─── @Min / @Max 경계값 ────────────────────────────────────────────────────

describe('@Min 경계값', () => {
  class Dto { @Field(min(5)) v!: number; }
  it('정확히 5 통과', async () => { expect((await deserialize<any>(Dto, { v: 5 })).v).toBe(5); });
  it('4.999 거부', async () => { expect(await failCode(Dto, { v: 4.999 })).toBe('min'); });
  it('5.001 통과', async () => { expect((await deserialize<any>(Dto, { v: 5.001 })).v).toBe(5.001); });
});

describe('@Max 경계값', () => {
  class Dto { @Field(max(10)) v!: number; }
  it('정확히 10 통과', async () => { expect((await deserialize<any>(Dto, { v: 10 })).v).toBe(10); });
  it('10.001 거부', async () => { expect(await failCode(Dto, { v: 10.001 })).toBe('max'); });
  it('9.999 통과', async () => { expect((await deserialize<any>(Dto, { v: 9.999 })).v).toBe(9.999); });
});

// ─── @MinLength / @MaxLength 경계값 ────────────────────────────────────────

describe('@MinLength 경계값', () => {
  class Dto { @Field(minLength(3)) v!: string; }
  it('정확히 3자 통과', async () => { expect((await deserialize<any>(Dto, { v: 'abc' })).v).toBe('abc'); });
  it('2자 거부', async () => { expect(await failCode(Dto, { v: 'ab' })).toBe('minLength'); });
  it('빈 문자열 거부', async () => { expect(await failCode(Dto, { v: '' })).toBe('minLength'); });
});

describe('@MaxLength 경계값', () => {
  class Dto { @Field(maxLength(5)) v!: string; }
  it('정확히 5자 통과', async () => { expect((await deserialize<any>(Dto, { v: 'abcde' })).v).toBe('abcde'); });
  it('6자 거부', async () => { expect(await failCode(Dto, { v: 'abcdef' })).toBe('maxLength'); });
});

// ─── @IsPort 경계값 ────────────────────────────────────────────────────────

describe('@IsPort 경계값', () => {
  class Dto { @Field(isPort) v!: string; }
  it('"0" 통과', async () => { expect((await deserialize<any>(Dto, { v: '0' })).v).toBe('0'); });
  it('"1" 통과', async () => { expect((await deserialize<any>(Dto, { v: '1' })).v).toBe('1'); });
  it('"65535" 통과', async () => { expect((await deserialize<any>(Dto, { v: '65535' })).v).toBe('65535'); });
  it('"65536" 거부', async () => { expect(await failCode(Dto, { v: '65536' })).toBe('isPort'); });
  it('"-1" 거부', async () => { expect(await failCode(Dto, { v: '-1' })).toBe('isPort'); });
});

// ─── @IsLatitude / @IsLongitude 경계값 ─────────────────────────────────────

describe('@IsLatitude 경계값', () => {
  class Dto { @Field(isLatitude) v!: string; }
  it('"-90" 통과', async () => { expect((await deserialize<any>(Dto, { v: '-90' })).v).toBe('-90'); });
  it('"90" 통과', async () => { expect((await deserialize<any>(Dto, { v: '90' })).v).toBe('90'); });
  it('"90.1" 거부', async () => { expect(await failCode(Dto, { v: '90.1' })).toBe('isLatitude'); });
  it('"-90.1" 거부', async () => { expect(await failCode(Dto, { v: '-90.1' })).toBe('isLatitude'); });
});

describe('@IsLongitude 경계값', () => {
  class Dto { @Field(isLongitude) v!: string; }
  it('"-180" 통과', async () => { expect((await deserialize<any>(Dto, { v: '-180' })).v).toBe('-180'); });
  it('"180" 통과', async () => { expect((await deserialize<any>(Dto, { v: '180' })).v).toBe('180'); });
  it('"180.1" 거부', async () => { expect(await failCode(Dto, { v: '180.1' })).toBe('isLongitude'); });
});

// ─── @IsMilitaryTime 경계값 ────────────────────────────────────────────────

describe('@IsMilitaryTime 경계값', () => {
  class Dto { @Field(isMilitaryTime) v!: string; }
  it('"00:00" 통과', async () => { expect((await deserialize<any>(Dto, { v: '00:00' })).v).toBe('00:00'); });
  it('"23:59" 통과', async () => { expect((await deserialize<any>(Dto, { v: '23:59' })).v).toBe('23:59'); });
  it('"24:00" 거부', async () => { expect(await failCode(Dto, { v: '24:00' })).toBe('isMilitaryTime'); });
  it('"25:00" 거부', async () => { expect(await failCode(Dto, { v: '25:00' })).toBe('isMilitaryTime'); });
});

// ─── @ArrayMinSize / @ArrayMaxSize 경계값 ──────────────────────────────────

describe('@ArrayMinSize 경계값', () => {
  class Dto { @Field(arrayMinSize(2)) v!: number[]; }
  it('정확히 2개 통과', async () => { expect((await deserialize<any>(Dto, { v: [1, 2] })).v).toEqual([1, 2]); });
  it('1개 거부', async () => { expect(await failCode(Dto, { v: [1] })).toBe('arrayMinSize'); });
  it('빈 배열 거부', async () => { expect(await failCode(Dto, { v: [] })).toBe('arrayMinSize'); });
});

describe('@ArrayMaxSize 경계값', () => {
  class Dto { @Field(arrayMaxSize(3)) v!: number[]; }
  it('정확히 3개 통과', async () => { expect((await deserialize<any>(Dto, { v: [1, 2, 3] })).v).toEqual([1, 2, 3]); });
  it('4개 거부', async () => { expect(await failCode(Dto, { v: [1, 2, 3, 4] })).toBe('arrayMaxSize'); });
});

// ─── @IsString에 다양한 타입 전달 ───────────────────────────────────────────

describe('@IsString에 비-문자열 타입 전달', () => {
  class Dto { @Field(isString) v!: string; }
  it('number 거부', async () => { expect(await failCode(Dto, { v: 42 })).toBe('isString'); });
  it('boolean 거부', async () => { expect(await failCode(Dto, { v: true })).toBe('isString'); });
  it('object 거부', async () => { expect(await failCode(Dto, { v: {} })).toBe('isString'); });
  it('array 거부', async () => { expect(await failCode(Dto, { v: [] })).toBe('isString'); });
  it('빈 문자열 통과', async () => { expect((await deserialize<any>(Dto, { v: '' })).v).toBe(''); });
});

// ─── @IsBoolean에 유사값 전달 ───────────────────────────────────────────────

describe('@IsBoolean에 유사값 전달', () => {
  class Dto { @Field(isBoolean) v!: boolean; }
  it('"true" (문자열) 거부', async () => { expect(await failCode(Dto, { v: 'true' })).toBe('isBoolean'); });
  it('1 (숫자) 거부', async () => { expect(await failCode(Dto, { v: 1 })).toBe('isBoolean'); });
  it('0 (숫자) 거부', async () => { expect(await failCode(Dto, { v: 0 })).toBe('isBoolean'); });
  it('null 거부 (undefined guard)', async () => {
    await expect(deserialize(Dto, { v: null })).rejects.toThrow(BakerValidationError);
  });
});

// ─── E-13: -0, NaN, Infinity edge cases ──────────────────────────────────

describe('E-13: -0, NaN, Infinity edge cases', () => {
  it('isNegative(-0) → false (0은 음수가 아님)', async () => {
    class Dto { @Field(isNegative) v!: number; }
    expect(await failCode(Dto, { v: -0 })).toBe('isNegative');
  });

  it('isPositive(NaN) — function returns false but emit code lets NaN through (NaN <= 0 is false)', () => {
    // isPositive function: NaN > 0 → false (correct)
    expect(isPositive(NaN)).toBe(false);
    // However, emitted code `if (v <= 0)` does NOT catch NaN because NaN <= 0 is false.
    // This is a known limitation of the emit optimization — guard with isNumber() for safety.
  });

  it('@Field(isNumber(), isPositive) rejects NaN via isNumber gate', async () => {
    class Dto { @Field(isNumber(), isPositive) v!: number; }
    await expect(deserialize(Dto, { v: NaN })).rejects.toThrow(BakerValidationError);
  });

  it('isDivisibleBy(Infinity) — does not throw at creation, but 42 % Infinity !== 0', () => {
    // isDivisibleBy only guards against n === 0, so Infinity is allowed as a divisor.
    // However: 42 % Infinity === 42 (not 0), so the rule returns false for non-zero values.
    const rule = isDivisibleBy(Infinity);
    expect(rule(42)).toBe(false);  // 42 % Infinity === 42
    expect(rule(0)).toBe(true);    // 0 % Infinity === 0
  });
});

// ─── E-20: min(NaN), max(NaN), max(Infinity) factory guard ──────────────

describe('E-20: min/max factory guard for non-finite bounds', () => {
  it('min(NaN) → throw Error', () => {
    expect(() => min(NaN)).toThrow();
  });

  it('max(Infinity) → throw Error', () => {
    expect(() => max(Infinity)).toThrow();
  });

  it('min(parseInt("abc")) → throw Error (parseInt returns NaN)', () => {
    expect(() => min(parseInt('abc'))).toThrow();
  });

  it('max(-Infinity) → throw Error', () => {
    expect(() => max(-Infinity)).toThrow();
  });

  it('min(-Infinity) → throw Error', () => {
    expect(() => min(-Infinity)).toThrow();
  });
});

// ─── E-5: isDivisibleBy(0) throw (→ C-5) ────────────────────────────────

describe('E-5: isDivisibleBy(0) throw', () => {
  it('isDivisibleBy(0) → throws Error at creation time', () => {
    expect(() => isDivisibleBy(0)).toThrow('divisor must not be zero');
  });

  it('isDivisibleBy(1) → normal operation (regression)', () => {
    const rule = isDivisibleBy(1);
    expect(rule(42)).toBe(true);
    expect(rule(0)).toBe(true);
    expect(rule(3.5)).toBe(false);
  });
});
