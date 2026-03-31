import { describe, it, expect, afterEach } from 'bun:test';
import {
  Field, configure, deserialize,
  isBakerError,
} from '../../index';
import type { BakerErrors } from '../../index';
import { isNumber, isBoolean, isDate, min, isNotEmpty } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => { unseal(); configure({}); });

// ─────────────────────────────────────────────────────────────────────────────

class ConvDto {
  @Field(isNumber())
  age!: number;

  @Field(isBoolean)
  active!: boolean;

  @Field(isDate)
  createdAt!: Date;
}

class ConvWithTransformDto {
  @Field(isNumber(), { transform: { deserialize: ({ value }) => Number(value), serialize: ({ value }) => value } })
  score!: number;
}

class ConvWithMinDto {
  @Field(isNumber(), min(0))
  count!: number;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('enableImplicitConversion', () => {
  it('string → number', async () => {
    configure({ autoConvert: true });
    const result = await deserialize<ConvDto>(ConvDto, {
      age: '25', active: true, createdAt: new Date(),
    }) as ConvDto;
    expect(result.age).toBe(25);
    expect(typeof result.age).toBe('number');
  });

  it('string → boolean', async () => {
    configure({ autoConvert: true });
    const result = await deserialize<ConvDto>(ConvDto, {
      age: 30, active: 'true', createdAt: new Date(),
    }) as ConvDto;
    expect(result.active).toBe(true);
  });

  it('"false" → false', async () => {
    configure({ autoConvert: true });
    const result = await deserialize<ConvDto>(ConvDto, {
      age: 30, active: 'false', createdAt: new Date(),
    }) as ConvDto;
    expect(result.active).toBe(false);
  });

  it('string → Date', async () => {
    configure({ autoConvert: true });
    const result = await deserialize<ConvDto>(ConvDto, {
      age: 30, active: true, createdAt: '2024-01-01T00:00:00.000Z',
    }) as ConvDto;
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.createdAt.toISOString()).toBe('2024-01-01T00:00:00.000Z');
  });

  it('unconvertible value → conversionFailed', async () => {
    configure({ autoConvert: true });
    expect(isBakerError(await deserialize(ConvDto, { age: 'notanumber', active: true, createdAt: new Date() }))).toBe(true);
  });

  it('explicit @Field transform present → conversion skipped', async () => {
    configure({ autoConvert: true });
    const result = await deserialize<ConvWithTransformDto>(ConvWithTransformDto, {
      score: '42',
    }) as ConvWithTransformDto;
    expect(result.score).toBe(42);
  });

  it('typed deps present (isNumber + min) → conversion works', async () => {
    configure({ autoConvert: true });
    const result = await deserialize<ConvWithMinDto>(ConvWithMinDto, {
      count: '5',
    }) as ConvWithMinDto;
    expect(result.count).toBe(5);
  });

  it('autoConvert: false → type error without conversion', async () => {
    configure({ autoConvert: false });
    expect(isBakerError(await deserialize(ConvDto, { age: '25', active: true, createdAt: new Date() }))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// @Type() primitive hint + non-typed validation rule
// @Type hint path: @Type + general rule + autoConvert
// ─────────────────────────────────────────────────────────────────────────────

describe('@Type hint implicit conversion', () => {
  it('@Type(() => Number) + isNotEmpty — string → number conversion then validation', async () => {
    class TypeHintDto {
      @Field(isNotEmpty, { type: () => Number })
      value!: number;
    }
    configure({ autoConvert: true });
    const result = await deserialize<TypeHintDto>(TypeHintDto, { value: '10' }) as TypeHintDto;
    expect(result.value).toBe(10);
  });

  it('@Type(() => Number) + isNotEmpty — conversion failure → conversionFailed', async () => {
    class TypeHintFailDto {
      @Field(isNotEmpty, { type: () => Number })
      value!: number;
    }
    configure({ autoConvert: true });
    const result = await deserialize(TypeHintFailDto, { value: 'abc' });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors[0]!.code).toBe('conversionFailed');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// stopAtFirstError + autoConvert
// ─────────────────────────────────────────────────────────────────────────────

describe('stopAtFirstError + autoConvert', () => {
  it('conversion success → normal behavior', async () => {
    class StopConvDto {
      @Field(isNumber(), min(0))
      count!: number;
    }
    configure({ autoConvert: true, stopAtFirstError: true });
    const result = await deserialize<StopConvDto>(StopConvDto, { count: '10' }) as StopConvDto;
    expect(result.count).toBe(10);
  });

  it('conversion failure → stops at first error', async () => {
    class StopConvFailDto {
      @Field(isNumber())
      first!: number;

      @Field(isBoolean)
      second!: boolean;
    }
    configure({ autoConvert: true, stopAtFirstError: true });
    const result = await deserialize(StopConvFailDto, { first: 'abc', second: 'notbool' });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors).toHaveLength(1);
    }
  });
});
