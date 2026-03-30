import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { deserialize, Field, isBakerError } from '../../index';
import { isString, isNumber, min, max } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

beforeEach(() => unseal());
afterEach(() => unseal());
// ─────────────────────────────────────────────────────────────────────────────

class NullableStringDto {
  @Field(isString, { nullable: true })
  nickname!: string | null;

  @Field(isString)
  name!: string;
}

class NullableOptionalDto {
  @Field(isString, { nullable: true, optional: true })
  bio!: string | null | undefined;
}

class NullableNumberDto {
  @Field(isNumber(), min(0), max(200), { nullable: true })
  age!: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('nullable deserialization', () => {
  it('null value allowed', async () => {
    const result = await deserialize<NullableStringDto>(NullableStringDto, {
      nickname: null, name: 'Alice',
    }) as NullableStringDto;
    expect(result.nickname).toBeNull();
    expect(result.name).toBe('Alice');
  });

  it('valid value passes', async () => {
    const result = await deserialize<NullableStringDto>(NullableStringDto, {
      nickname: 'bob', name: 'Alice',
    }) as NullableStringDto;
    expect(result.nickname).toBe('bob');
  });

  it('undefined → rejected (nullable without optional)', async () => {
    const result = await deserialize(NullableStringDto, { name: 'Alice' });
    expect(isBakerError(result)).toBe(true);
  });

  it('nullable + optional → both null and undefined allowed', async () => {
    const r1 = await deserialize<NullableOptionalDto>(NullableOptionalDto, { bio: null }) as NullableOptionalDto;
    expect(r1.bio).toBeNull();

    const r2 = await deserialize<NullableOptionalDto>(NullableOptionalDto, {}) as NullableOptionalDto;
    expect(r2.bio).toBeUndefined();
  });

  it('nullable number null → assigned, valid value → validation passes', async () => {
    const r1 = await deserialize<NullableNumberDto>(NullableNumberDto, { age: null }) as NullableNumberDto;
    expect(r1.age).toBeNull();

    const r2 = await deserialize<NullableNumberDto>(NullableNumberDto, { age: 25 }) as NullableNumberDto;
    expect(r2.age).toBe(25);
  });

  it('nullable number range violation → error', async () => {
    const result = await deserialize(NullableNumberDto, { age: -1 });
    expect(isBakerError(result)).toBe(true);
  });
});

