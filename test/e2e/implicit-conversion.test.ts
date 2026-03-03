import { describe, it, expect, afterEach } from 'bun:test';
import { seal, deserialize, IsNumber, IsBoolean, IsDate, IsString, Min, Transform } from '../../index';
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
