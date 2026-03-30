import { describe, it, expect, afterEach } from 'bun:test';
import { Field, deserialize, isBakerError } from '../../index';
import type { BakerErrors } from '../../index';
import { isString } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class DefinedDto {
  @Field(isString)
  name!: string;
}

class OptionalDto {
  @Field(isString, { optional: true })
  nickname?: string;
}

class DefinedOverrideDto {
  @Field(isString)
  tag!: string;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('@IsDefined (implicit in new API)', () => {
  it('undefined → isDefined error', async () => {
    const result = await deserialize(DefinedDto, {});
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors.some(e => e.code === 'isDefined')).toBe(true);
    }
  });

  it('valid value → passes', async () => {
    const result = await deserialize<DefinedDto>(DefinedDto, { name: 'Alice' }) as DefinedDto;
    expect(result.name).toBe('Alice');
  });

  it('empty string → passes isDefined, proceeds to isString validation', async () => {
    const result = await deserialize<DefinedDto>(DefinedDto, { name: '' }) as DefinedDto;
    expect(result.name).toBe('');
  });
});

describe('optional', () => {
  it('undefined → skip', async () => {
    const result = await deserialize<OptionalDto>(OptionalDto, {}) as OptionalDto;
    expect(result.nickname).toBeUndefined();
  });

  it('null → skip', async () => {
    const result = await deserialize<OptionalDto>(OptionalDto, { nickname: null }) as OptionalDto;
    expect(result.nickname).toBeUndefined();
  });

  it('valid value → validation passes', async () => {
    const result = await deserialize<OptionalDto>(OptionalDto, { nickname: 'Bob' }) as OptionalDto;
    expect(result.nickname).toBe('Bob');
  });
});

describe('required field (not optional) → undefined rejected', () => {
  it('required → undefined rejected', async () => {
    const result = await deserialize(DefinedOverrideDto, {});
    expect(isBakerError(result)).toBe(true);
  });
});
