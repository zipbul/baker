import { describe, it, expect } from 'bun:test';
import { deserialize, BakerValidationError, Field } from '../../index';
import { isString, isNumber, min } from '../../src/rules/index';
// ─────────────────────────────────────────────────────────────────────────────

class ConditionalDto {
  @Field(isString)
  type!: string;

  @Field(isString, { when: (obj: any) => obj.type === 'business' })
  companyName!: string;
}

class ConditionalWithMinDto {
  @Field(isNumber())
  role!: number;

  @Field(isNumber(), min(100), { when: (obj: any) => obj.role >= 2 })
  budget!: number;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('@Field({ when }) — conditional validation', () => {
  it('조건 true → 검증 적용', async () => {
    await expect(
      deserialize(ConditionalDto, { type: 'business' }),
    ).rejects.toThrow(BakerValidationError);
  });

  it('조건 true + 유효 값 → 통과', async () => {
    const result = await deserialize<ConditionalDto>(ConditionalDto, {
      type: 'business', companyName: 'Acme',
    });
    expect(result.companyName).toBe('Acme');
  });

  it('조건 false → 검증 skip', async () => {
    const result = await deserialize<ConditionalDto>(ConditionalDto, {
      type: 'personal',
    });
    expect(result.type).toBe('personal');
    expect(result.companyName).toBeUndefined();
  });

  it('조건 false → 값 있어도 skip (할당 안 됨)', async () => {
    const result = await deserialize<ConditionalDto>(ConditionalDto, {
      type: 'personal', companyName: 123 as any,
    });
    expect(result.type).toBe('personal');
  });

  it('숫자 조건 + Min 검증', async () => {
    // role >= 2 → Min(100) 적용 → budget 50 거부
    await expect(
      deserialize(ConditionalWithMinDto, { role: 3, budget: 50 }),
    ).rejects.toThrow(BakerValidationError);
  });

  it('숫자 조건 false → Min skip', async () => {
    const result = await deserialize<ConditionalWithMinDto>(ConditionalWithMinDto, {
      role: 1, budget: 5,
    });
    expect(result.role).toBe(1);
  });
});
