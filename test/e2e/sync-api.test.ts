import { describe, it, expect, afterEach } from 'bun:test';
import { Field, deserialize, serialize } from '../../index';
import { isString, isNumber, minLength } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';
import { SEALED } from '../../src/symbols';
import type { SealedExecutors } from '../../src/types';

afterEach(() => unseal());

// ─── sync DTO (no async transform) ──────────────────────────────────────────

class SyncDto {
  @Field(isString)
  name!: string;

  @Field(isNumber())
  age!: number;
}

// ─── async DTO (has async transform) ────────────────────────────────────────

class AsyncDto {
  @Field(isString, {
    transform: async ({ value }) => typeof value === 'string' ? value.trim() : value,
  })
  name!: string;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('sync API — deserialize', () => {
  it('sync DTO has _isAsync = false', async () => {
    await deserialize(SyncDto, { name: 'Alice', age: 30 });
    const sealed = (SyncDto as any)[SEALED] as SealedExecutors<SyncDto>;
    expect(sealed._isAsync).toBe(false);
  });

  it('async DTO has _isAsync = true', async () => {
    await deserialize(AsyncDto, { name: 'Bob' });
    const sealed = (AsyncDto as any)[SEALED] as SealedExecutors<AsyncDto>;
    expect(sealed._isAsync).toBe(true);
  });

  it('sync DTO deserialize returns Promise but is not an async function', () => {
    const result = deserialize(SyncDto, { name: 'Alice', age: 30 });
    expect(result).toBeInstanceOf(Promise);
  });

  it('sync DTO deserialize succeeds', async () => {
    const result = await deserialize(SyncDto, { name: 'Alice', age: 30 });
    expect(result.name).toBe('Alice');
    expect(result.age).toBe(30);
  });

  it('sync DTO validation failure → rejected promise', async () => {
    await expect(
      deserialize(SyncDto, { name: 123, age: 'bad' }),
    ).rejects.toThrow('Validation failed');
  });

  it('async DTO deserialize succeeds', async () => {
    const result = await deserialize(AsyncDto, { name: '  trimmed  ' });
    expect(result.name).toBe('trimmed');
  });
});

describe('sync API — serialize', () => {
  it('sync DTO has _isSerializeAsync = false', async () => {
    await deserialize(SyncDto, { name: 'Alice', age: 30 });
    const sealed = (SyncDto as any)[SEALED] as SealedExecutors<SyncDto>;
    expect(sealed._isSerializeAsync).toBe(false);
  });

  it('sync DTO serialize succeeds', async () => {
    const dto = Object.assign(new SyncDto(), { name: 'Bob', age: 25 });
    const result = await serialize(dto);
    expect(result).toEqual({ name: 'Bob', age: 25 });
  });

  it('serialize returns Promise', () => {
    const dto = Object.assign(new SyncDto(), { name: 'Bob', age: 25 });
    const result = serialize(dto);
    expect(result).toBeInstanceOf(Promise);
  });
});
