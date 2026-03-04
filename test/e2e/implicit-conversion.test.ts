import { describe, it, expect, afterEach } from 'bun:test';
import {
  seal, deserialize, IsNumber, IsBoolean, IsDate,
  Min, Transform, Type, SealError,
  BakerValidationError, IsNotEmpty,
} from '../../index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class ConvDto {
  @IsNumber()
  age!: number;

  @IsBoolean()
  active!: boolean;

  @IsDate()
  createdAt!: Date;
}

class ConvWithTransformDto {
  @Transform(({ value }) => Number(value))
  @IsNumber()
  score!: number;
}

class ConvWithMinDto {
  @IsNumber()
  @Min(0)
  count!: number;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('enableImplicitConversion', () => {
  it('string → number', async () => {
    seal({ enableImplicitConversion: true });
    const result = await deserialize<ConvDto>(ConvDto, {
      age: '25', active: true, createdAt: new Date(),
    });
    expect(result.age).toBe(25);
    expect(typeof result.age).toBe('number');
  });

  it('string → boolean', async () => {
    seal({ enableImplicitConversion: true });
    const result = await deserialize<ConvDto>(ConvDto, {
      age: 30, active: 'true', createdAt: new Date(),
    });
    expect(result.active).toBe(true);
  });

  it('"false" → false', async () => {
    seal({ enableImplicitConversion: true });
    const result = await deserialize<ConvDto>(ConvDto, {
      age: 30, active: 'false', createdAt: new Date(),
    });
    expect(result.active).toBe(false);
  });

  it('string → Date', async () => {
    seal({ enableImplicitConversion: true });
    const result = await deserialize<ConvDto>(ConvDto, {
      age: 30, active: true, createdAt: '2024-01-01T00:00:00.000Z',
    });
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.createdAt.toISOString()).toBe('2024-01-01T00:00:00.000Z');
  });

  it('변환 불가 값 → conversionFailed', async () => {
    seal({ enableImplicitConversion: true });
    await expect(
      deserialize(ConvDto, { age: 'notanumber', active: true, createdAt: new Date() }),
    ).rejects.toThrow();
  });

  it('명시적 @Transform 있으면 변환 스킵', async () => {
    seal({ enableImplicitConversion: true });
    const result = await deserialize<ConvWithTransformDto>(ConvWithTransformDto, {
      score: '42',
    });
    expect(result.score).toBe(42);
  });

  it('typed deps 있는 경우 (@IsNumber + @Min) 변환 동작', async () => {
    seal({ enableImplicitConversion: true });
    const result = await deserialize<ConvWithMinDto>(ConvWithMinDto, {
      count: '5',
    });
    expect(result.count).toBe(5);
  });

  it('enableImplicitConversion: false → 변환 없이 타입 에러', async () => {
    seal({ enableImplicitConversion: false });
    await expect(
      deserialize(ConvDto, { age: '25', active: true, createdAt: new Date() }),
    ).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// L495-498, L518 — @Type() primitive hint + non-typed validation rule
// @Type 힌트 경로: @ValidateNested 없이 @Type + general rule + enableImplicitConversion
// ─────────────────────────────────────────────────────────────────────────────

describe('@Type hint implicit conversion', () => {
  it('@Type(() => Number) + @IsNotEmpty — string → number 변환 후 검증', async () => {
    class TypeHintDto {
      @Type(() => Number)
      @IsNotEmpty()
      value!: number;
    }
    seal({ enableImplicitConversion: true });
    const result = await deserialize<TypeHintDto>(TypeHintDto, { value: '10' });
    expect(result.value).toBe(10);
  });

  it('@Type(() => Number) + @IsNotEmpty — 변환 실패 → conversionFailed', async () => {
    class TypeHintFailDto {
      @Type(() => Number)
      @IsNotEmpty()
      value!: number;
    }
    seal({ enableImplicitConversion: true });
    try {
      await deserialize(TypeHintFailDto, { value: 'abc' });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BakerValidationError);
      expect((e as BakerValidationError).errors[0]!.code).toBe('conversionFailed');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// L577-581 — stopAtFirstError + enableImplicitConversion
// ─────────────────────────────────────────────────────────────────────────────

describe('stopAtFirstError + enableImplicitConversion', () => {
  it('변환 성공 시 정상 동작', async () => {
    class StopConvDto {
      @IsNumber()
      @Min(0)
      count!: number;
    }
    seal({ enableImplicitConversion: true, stopAtFirstError: true });
    const result = await deserialize<StopConvDto>(StopConvDto, { count: '10' });
    expect(result.count).toBe(10);
  });

  it('변환 실패 시 첫 에러에서 중단', async () => {
    class StopConvFailDto {
      @IsNumber()
      first!: number;

      @IsBoolean()
      second!: boolean;
    }
    seal({ enableImplicitConversion: true, stopAtFirstError: true });
    try {
      await deserialize(StopConvFailDto, { first: 'abc', second: 'notbool' });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BakerValidationError);
      expect((e as BakerValidationError).errors).toHaveLength(1);
    }
  });
});

