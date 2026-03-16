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
  it('condition true → validation applied', async () => {
    await expect(
      deserialize(ConditionalDto, { type: 'business' }),
    ).rejects.toThrow(BakerValidationError);
  });

  it('condition true + valid value → passes', async () => {
    const result = await deserialize<ConditionalDto>(ConditionalDto, {
      type: 'business', companyName: 'Acme',
    });
    expect(result.companyName).toBe('Acme');
  });

  it('condition false → validation skipped', async () => {
    const result = await deserialize<ConditionalDto>(ConditionalDto, {
      type: 'personal',
    });
    expect(result.type).toBe('personal');
    expect(result.companyName).toBeUndefined();
  });

  it('condition false → value present but skipped (not assigned)', async () => {
    const result = await deserialize<ConditionalDto>(ConditionalDto, {
      type: 'personal', companyName: 123 as any,
    });
    expect(result.type).toBe('personal');
  });

  it('numeric condition + Min validation', async () => {
    // role >= 2 → Min(100) applied → budget 50 rejected
    await expect(
      deserialize(ConditionalWithMinDto, { role: 3, budget: 50 }),
    ).rejects.toThrow(BakerValidationError);
  });

  it('numeric condition false → Min skipped', async () => {
    const result = await deserialize<ConditionalWithMinDto>(ConditionalWithMinDto, {
      role: 1, budget: 5,
    });
    expect(result.role).toBe(1);
  });
});
