import { describe, it, expect } from 'bun:test';
import { deserialize, isBakerError, Field } from '../../index';
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
    expect(isBakerError(await deserialize(ConditionalDto, { type: 'business' }))).toBe(true);
  });

  it('condition true + valid value → passes', async () => {
    const result = await deserialize(ConditionalDto, {
      type: 'business', companyName: 'Acme',
    }) as ConditionalDto;
    expect(result.companyName).toBe('Acme');
  });

  it('condition false → validation skipped', async () => {
    const result = await deserialize(ConditionalDto, {
      type: 'personal',
    }) as ConditionalDto;
    expect(result.type).toBe('personal');
    expect(result.companyName).toBeUndefined();
  });

  it('condition false → value present but skipped (not assigned)', async () => {
    const result = await deserialize(ConditionalDto, {
      type: 'personal', companyName: 123 as any,
    }) as ConditionalDto;
    expect(result.type).toBe('personal');
  });


  it('numeric condition + Min validation', async () => {
    // role >= 2 → Min(100) applied → budget 50 rejected
    expect(isBakerError(await deserialize(ConditionalWithMinDto, { role: 3, budget: 50 }))).toBe(true);
  });

  it('numeric condition false → Min skipped', async () => {
    const result = await deserialize(ConditionalWithMinDto, {
      role: 1, budget: 5,
    }) as ConditionalWithMinDto;
    expect(result.role).toBe(1);
  });
});
