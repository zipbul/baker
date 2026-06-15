import { describe, it, expect, afterEach, beforeEach } from 'bun:test';

import { Baker, Field, deserialize, isBakerIssueSet } from '../../index';
import {
  isString,
  isNumber,
  isBoolean,
  isInt,
  min,
  max,
  isPositive,
  isNegative,
  isDivisibleBy,
  minLength,
  maxLength,
  isPort,
  isLatitude,
  isLongitude,
  isMilitaryTime,
  arrayMinSize,
  arrayMaxSize,
} from '../../src/rules/index';
import { sealClass } from '../integration/helpers/seal';
import { unseal } from '../integration/helpers/unseal';

const baker = new Baker();

beforeEach(() => baker.seal());
afterEach(() => unseal());

/** Helper: verify rejection + return error code */
async function failCode<T>(cls: new (...args: never[]) => T, input: unknown): Promise<string> {
  const result = await deserialize(cls, input);
  if (!isBakerIssueSet(result)) {
    throw new Error('expected validation failure');
  }
  return result.errors[0]!.code;
}

/** Helper: successful deserialize, returns the typed instance (throws on validation failure). */
async function ok<T extends { v: unknown }>(cls: new (...args: never[]) => T, input: unknown): Promise<T> {
  const result = await deserialize<T>(cls, input);
  if (isBakerIssueSet(result)) {
    throw new Error('expected success, got error: ' + JSON.stringify(result.errors));
  }
  return result;
}

// ─── @IsNumber boundary values ──────────────────────────────────────────────

describe('@IsNumber boundary values', () => {
  @baker.Recipe
  class Dto {
    @Field(isNumber()) v!: number;
  }

  it('NaN rejected', async () => {
    expect(await failCode(Dto, { v: NaN })).toBe('isNumber');
  });
  it('Infinity rejected', async () => {
    expect(await failCode(Dto, { v: Infinity })).toBe('isNumber');
  });
  it('-Infinity rejected', async () => {
    expect(await failCode(Dto, { v: -Infinity })).toBe('isNumber');
  });
  it('0 passes', async () => {
    expect((await ok(Dto, { v: 0 })).v).toBe(0);
  });
  it('-0 passes', async () => {
    expect((await ok(Dto, { v: -0 })).v).toBe(-0);
  });
  it('MAX_SAFE_INTEGER passes', async () => {
    expect((await ok(Dto, { v: Number.MAX_SAFE_INTEGER })).v).toBe(Number.MAX_SAFE_INTEGER);
  });
  it('MIN_SAFE_INTEGER passes', async () => {
    expect((await ok(Dto, { v: Number.MIN_SAFE_INTEGER })).v).toBe(Number.MIN_SAFE_INTEGER);
  });
});

describe('@IsNumber({ allowNaN: true }) NaN allowed', () => {
  @baker.Recipe
  class Dto {
    @Field(isNumber({ allowNaN: true })) v!: number;
  }
  it('NaN passes', async () => {
    const r = await ok(Dto, { v: NaN });
    expect(isNaN(r.v as number)).toBe(true);
  });
});

describe('@IsNumber({ allowInfinity: true }) Infinity allowed', () => {
  @baker.Recipe
  class Dto {
    @Field(isNumber({ allowInfinity: true })) v!: number;
  }
  it('Infinity passes', async () => {
    expect((await ok(Dto, { v: Infinity })).v).toBe(Infinity);
  });
  it('-Infinity passes', async () => {
    expect((await ok(Dto, { v: -Infinity })).v).toBe(-Infinity);
  });
});

describe('@IsNumber({ maxDecimalPlaces: 2 }) decimal limit', () => {
  @baker.Recipe
  class Dto {
    @Field(isNumber({ maxDecimalPlaces: 2 })) v!: number;
  }
  it('2 decimal places passes', async () => {
    expect((await ok(Dto, { v: 3.14 })).v).toBe(3.14);
  });
  it('integer passes', async () => {
    expect((await ok(Dto, { v: 5 })).v).toBe(5);
  });
  it('3 decimal places rejected', async () => {
    expect(await failCode(Dto, { v: 3.141 })).toBe('isNumber');
  });
  it('0 decimal places (integer) boundary', async () => {
    expect((await ok(Dto, { v: 10 })).v).toBe(10);
  });
});

// ─── @IsPositive / @IsNegative boundary values ──────────────────────────────

describe('@IsPositive boundary values', () => {
  @baker.Recipe
  class Dto {
    @Field(isPositive) v!: number;
  }
  it('0 rejected', async () => {
    expect(await failCode(Dto, { v: 0 })).toBe('isPositive');
  });
  it('0.001 passes', async () => {
    expect((await ok(Dto, { v: 0.001 })).v).toBe(0.001);
  });
});

describe('@IsNegative boundary values', () => {
  @baker.Recipe
  class Dto {
    @Field(isNegative) v!: number;
  }
  it('0 rejected', async () => {
    expect(await failCode(Dto, { v: 0 })).toBe('isNegative');
  });
  it('-0.001 passes', async () => {
    expect((await ok(Dto, { v: -0.001 })).v).toBe(-0.001);
  });
});

// ─── @IsInt boundary values ──────────────────────────────────────────────────

describe('@IsInt boundary values', () => {
  @baker.Recipe
  class Dto {
    @Field(isInt) v!: number;
  }
  it('MAX_SAFE_INTEGER passes', async () => {
    expect((await ok(Dto, { v: Number.MAX_SAFE_INTEGER })).v).toBe(Number.MAX_SAFE_INTEGER);
  });
  it('MIN_SAFE_INTEGER passes', async () => {
    expect((await ok(Dto, { v: Number.MIN_SAFE_INTEGER })).v).toBe(Number.MIN_SAFE_INTEGER);
  });
  it('0.5 rejected', async () => {
    expect(await failCode(Dto, { v: 0.5 })).toBe('isInt');
  });
  it('NaN rejected (typeof check)', async () => {
    expect(await failCode(Dto, { v: NaN })).toBe('isInt');
  });
});

// ─── @Min / @Max boundary values ────────────────────────────────────────────

describe('@Min boundary values', () => {
  @baker.Recipe
  class Dto {
    @Field(min(5)) v!: number;
  }
  it('exactly 5 passes', async () => {
    expect((await ok(Dto, { v: 5 })).v).toBe(5);
  });
  it('4.999 rejected', async () => {
    expect(await failCode(Dto, { v: 4.999 })).toBe('min');
  });
  it('5.001 passes', async () => {
    expect((await ok(Dto, { v: 5.001 })).v).toBe(5.001);
  });
});

describe('@Max boundary values', () => {
  @baker.Recipe
  class Dto {
    @Field(max(10)) v!: number;
  }
  it('exactly 10 passes', async () => {
    expect((await ok(Dto, { v: 10 })).v).toBe(10);
  });
  it('10.001 rejected', async () => {
    expect(await failCode(Dto, { v: 10.001 })).toBe('max');
  });
  it('9.999 passes', async () => {
    expect((await ok(Dto, { v: 9.999 })).v).toBe(9.999);
  });
});

// ─── @MinLength / @MaxLength boundary values ────────────────────────────────

describe('@MinLength boundary values', () => {
  @baker.Recipe
  class Dto {
    @Field(minLength(3)) v!: string;
  }
  it('exactly 3 chars passes', async () => {
    expect((await ok(Dto, { v: 'abc' })).v).toBe('abc');
  });
  it('2 chars rejected', async () => {
    expect(await failCode(Dto, { v: 'ab' })).toBe('minLength');
  });
  it('empty string rejected', async () => {
    expect(await failCode(Dto, { v: '' })).toBe('minLength');
  });
});

describe('@MaxLength boundary values', () => {
  @baker.Recipe
  class Dto {
    @Field(maxLength(5)) v!: string;
  }
  it('exactly 5 chars passes', async () => {
    expect((await ok(Dto, { v: 'abcde' })).v).toBe('abcde');
  });
  it('6 chars rejected', async () => {
    expect(await failCode(Dto, { v: 'abcdef' })).toBe('maxLength');
  });
});

// ─── @IsPort boundary values ────────────────────────────────────────────────

describe('@IsPort boundary values', () => {
  @baker.Recipe
  class Dto {
    @Field(isPort) v!: string;
  }
  it('"0" passes', async () => {
    expect((await ok(Dto, { v: '0' })).v).toBe('0');
  });
  it('"1" passes', async () => {
    expect((await ok(Dto, { v: '1' })).v).toBe('1');
  });
  it('"65535" passes', async () => {
    expect((await ok(Dto, { v: '65535' })).v).toBe('65535');
  });
  it('"65536" rejected', async () => {
    expect(await failCode(Dto, { v: '65536' })).toBe('isPort');
  });
  it('"-1" rejected', async () => {
    expect(await failCode(Dto, { v: '-1' })).toBe('isPort');
  });
});

// ─── @IsLatitude / @IsLongitude boundary values ──────────────────────────────

describe('@IsLatitude boundary values', () => {
  @baker.Recipe
  class Dto {
    @Field(isLatitude) v!: string;
  }
  it('"-90" passes', async () => {
    expect((await ok(Dto, { v: '-90' })).v).toBe('-90');
  });
  it('"90" passes', async () => {
    expect((await ok(Dto, { v: '90' })).v).toBe('90');
  });
  it('"90.1" rejected', async () => {
    expect(await failCode(Dto, { v: '90.1' })).toBe('isLatitude');
  });
  it('"-90.1" rejected', async () => {
    expect(await failCode(Dto, { v: '-90.1' })).toBe('isLatitude');
  });
});

describe('@IsLongitude boundary values', () => {
  @baker.Recipe
  class Dto {
    @Field(isLongitude) v!: string;
  }
  it('"-180" passes', async () => {
    expect((await ok(Dto, { v: '-180' })).v).toBe('-180');
  });
  it('"180" passes', async () => {
    expect((await ok(Dto, { v: '180' })).v).toBe('180');
  });
  it('"180.1" rejected', async () => {
    expect(await failCode(Dto, { v: '180.1' })).toBe('isLongitude');
  });
});

// ─── @IsMilitaryTime boundary values ────────────────────────────────────────

describe('@IsMilitaryTime boundary values', () => {
  @baker.Recipe
  class Dto {
    @Field(isMilitaryTime) v!: string;
  }
  it('"00:00" passes', async () => {
    expect((await ok(Dto, { v: '00:00' })).v).toBe('00:00');
  });
  it('"23:59" passes', async () => {
    expect((await ok(Dto, { v: '23:59' })).v).toBe('23:59');
  });
  it('"24:00" rejected', async () => {
    expect(await failCode(Dto, { v: '24:00' })).toBe('isMilitaryTime');
  });
  it('"25:00" rejected', async () => {
    expect(await failCode(Dto, { v: '25:00' })).toBe('isMilitaryTime');
  });
});

// ─── @ArrayMinSize / @ArrayMaxSize boundary values ──────────────────────────

describe('@ArrayMinSize boundary values', () => {
  @baker.Recipe
  class Dto {
    @Field(arrayMinSize(2)) v!: number[];
  }
  it('exactly 2 passes', async () => {
    expect((await ok(Dto, { v: [1, 2] })).v).toEqual([1, 2]);
  });
  it('1 rejected', async () => {
    expect(await failCode(Dto, { v: [1] })).toBe('arrayMinSize');
  });
  it('empty array rejected', async () => {
    expect(await failCode(Dto, { v: [] })).toBe('arrayMinSize');
  });
});

describe('@ArrayMaxSize boundary values', () => {
  @baker.Recipe
  class Dto {
    @Field(arrayMaxSize(3)) v!: number[];
  }
  it('exactly 3 passes', async () => {
    expect((await ok(Dto, { v: [1, 2, 3] })).v).toEqual([1, 2, 3]);
  });
  it('4 rejected', async () => {
    expect(await failCode(Dto, { v: [1, 2, 3, 4] })).toBe('arrayMaxSize');
  });
});

// ─── @IsString with various types ───────────────────────────────────────────

describe('@IsString with non-string types', () => {
  @baker.Recipe
  class Dto {
    @Field(isString) v!: string;
  }
  it('number rejected', async () => {
    expect(await failCode(Dto, { v: 42 })).toBe('isString');
  });
  it('boolean rejected', async () => {
    expect(await failCode(Dto, { v: true })).toBe('isString');
  });
  it('object rejected', async () => {
    expect(await failCode(Dto, { v: {} })).toBe('isString');
  });
  it('array rejected', async () => {
    expect(await failCode(Dto, { v: [] })).toBe('isString');
  });
  it('empty string passes', async () => {
    expect((await ok(Dto, { v: '' })).v).toBe('');
  });
});

// ─── @IsBoolean with similar values ─────────────────────────────────────────

describe('@IsBoolean with similar values', () => {
  @baker.Recipe
  class Dto {
    @Field(isBoolean) v!: boolean;
  }
  it('"true" (string) rejected', async () => {
    expect(await failCode(Dto, { v: 'true' })).toBe('isBoolean');
  });
  it('1 (number) rejected', async () => {
    expect(await failCode(Dto, { v: 1 })).toBe('isBoolean');
  });
  it('0 (number) rejected', async () => {
    expect(await failCode(Dto, { v: 0 })).toBe('isBoolean');
  });
  it('null rejected (undefined guard)', async () => {
    expect(isBakerIssueSet(await deserialize(Dto, { v: null }))).toBe(true);
  });
});

// ─── E-13: -0, NaN, Infinity edge cases ──────────────────────────────────

describe('E-13: -0, NaN, Infinity edge cases', () => {
  it('isNegative(-0) → false (0 is not negative)', async () => {
    @baker.Recipe
    class Dto {
      @Field(isNegative) v!: number;
    }
    sealClass(Dto);
    expect(await failCode(Dto, { v: -0 })).toBe('isNegative');
  });

  it('isPositive(NaN) rejected to match runtime rule semantics', async () => {
    @baker.Recipe
    class Dto {
      @Field(isPositive) v!: number;
    }
    sealClass(Dto);
    expect(isPositive(NaN)).toBe(false);
    expect(isBakerIssueSet(await deserialize(Dto, { v: NaN }))).toBe(true);
  });

  it('@Field(isNumber(), isPositive) rejects NaN via isNumber gate', async () => {
    @baker.Recipe
    class Dto {
      @Field(isNumber(), isPositive) v!: number;
    }
    sealClass(Dto);
    expect(isBakerIssueSet(await deserialize(Dto, { v: NaN }))).toBe(true);
  });

  it('isDivisibleBy(Infinity) — does not throw at creation, but 42 % Infinity !== 0', () => {
    // isDivisibleBy only guards against n === 0, so Infinity is allowed as a divisor.
    // However: 42 % Infinity === 42 (not 0), so the rule returns false for non-zero values.
    const rule = isDivisibleBy(Infinity);
    expect(rule(42)).toBe(false); // 42 % Infinity === 42
    expect(rule(0)).toBe(true); // 0 % Infinity === 0
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

// ─── E-5: isDivisibleBy(0) throw ────────────────────────────────────────

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
