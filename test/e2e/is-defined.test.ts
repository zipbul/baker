import { describe, it, expect, afterEach } from 'bun:test';
import { Field, deserialize, BakerValidationError } from '../../index';
import { isString } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

// In the new API, fields are required by default (isDefined is implicit)
class DefinedDto {
  @Field(isString)
  name!: string;
}

class OptionalDto {
  @Field(isString, { optional: true })
  nickname?: string;
}

// In the new API, required is the default — just @Field(isString) without optional
class DefinedOverrideDto {
  @Field(isString)
  tag!: string;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('@IsDefined (implicit in new API)', () => {
  it('undefined → isDefined error', async () => {
    try {
      await deserialize(DefinedDto, {});
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BakerValidationError);
      expect((e as BakerValidationError).errors.some(e => e.code === 'isDefined')).toBe(true);
    }
  });

  it('valid value → passes', async () => {
    const result = await deserialize<DefinedDto>(DefinedDto, { name: 'Alice' });
    expect(result.name).toBe('Alice');
  });

  it('empty string → passes isDefined, proceeds to isString validation', async () => {
    const result = await deserialize<DefinedDto>(DefinedDto, { name: '' });
    expect(result.name).toBe('');
  });
});

describe('optional', () => {
  it('undefined → skip', async () => {
    const result = await deserialize<OptionalDto>(OptionalDto, {});
    expect(result.nickname).toBeUndefined();
  });

  it('null → skip', async () => {
    const result = await deserialize<OptionalDto>(OptionalDto, { nickname: null });
    expect(result.nickname).toBeUndefined();
  });

  it('valid value → validation passes', async () => {
    const result = await deserialize<OptionalDto>(OptionalDto, { nickname: 'Bob' });
    expect(result.nickname).toBe('Bob');
  });
});

describe('required field (not optional) → undefined rejected', () => {
  it('required → undefined rejected', async () => {
    await expect(
      deserialize(DefinedOverrideDto, {}),
    ).rejects.toThrow(BakerValidationError);
  });
});
