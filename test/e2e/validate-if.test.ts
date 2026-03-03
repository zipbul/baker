import { describe, it, expect, afterEach } from 'bun:test';
import { seal, deserialize, BakerValidationError, IsString, IsNumber, IsOptional, ValidateIf, Min } from '../../index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class ConditionalDto {
  @IsString()
  type!: string;

  @ValidateIf((obj: any) => obj.type === 'business')
  @IsString()
  companyName!: string;
}

class ConditionalWithMinDto {
  @IsNumber()
  role!: number;

  @ValidateIf((obj: any) => obj.role >= 2)
  @IsNumber()
  @Min(100)
  budget!: number;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('@ValidateIf', () => {
  it('조건 true → 검증 적용', async () => {
    seal();
    await expect(
      deserialize(ConditionalDto, { type: 'business' }),
    ).rejects.toThrow(BakerValidationError);
  });

  it('조건 true + 유효 값 → 통과', async () => {
    seal();
    const result = await deserialize<ConditionalDto>(ConditionalDto, {
      type: 'business', companyName: 'Acme',
    });
    expect(result.companyName).toBe('Acme');
  });

  it('조건 false → 검증 skip', async () => {
    seal();
    const result = await deserialize<ConditionalDto>(ConditionalDto, {
      type: 'personal',
    });
    expect(result.type).toBe('personal');
    expect(result.companyName).toBeUndefined();
  });

  it('조건 false → 값 있어도 skip (할당 안 됨)', async () => {
    seal();
    const result = await deserialize<ConditionalDto>(ConditionalDto, {
      type: 'personal', companyName: 123 as any,
    });
    expect(result.type).toBe('personal');
  });

  it('숫자 조건 + Min 검증', async () => {
    seal();
    // role >= 2 → Min(100) 적용 → budget 50 거부
    await expect(
      deserialize(ConditionalWithMinDto, { role: 3, budget: 50 }),
    ).rejects.toThrow(BakerValidationError);
  });

  it('숫자 조건 false → Min skip', async () => {
    seal();
    const result = await deserialize<ConditionalWithMinDto>(ConditionalWithMinDto, {
      role: 1, budget: 5,
    });
    expect(result.role).toBe(1);
  });
});
