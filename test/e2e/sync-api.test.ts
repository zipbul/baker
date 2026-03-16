import { describe, it, expect, afterEach } from 'bun:test';
import { Field, deserialize, serialize } from '../../index';
import { isString, isNumber, minLength } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';
import { SEALED } from '../../src/symbols';
import type { SealedExecutors } from '../../src/types';

afterEach(() => unseal());

// ─── sync DTO (async transform 없음) ────────────────────────────────────────

class SyncDto {
  @Field(isString)
  name!: string;

  @Field(isNumber())
  age!: number;
}

// ─── async DTO (async transform 있음) ────────────────────────────────────────

class AsyncDto {
  @Field(isString, {
    transform: async ({ value }) => typeof value === 'string' ? value.trim() : value,
  })
  name!: string;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('sync API — deserialize', () => {
  it('sync DTO는 _isAsync = false', async () => {
    await deserialize(SyncDto, { name: 'Alice', age: 30 });
    const sealed = (SyncDto as any)[SEALED] as SealedExecutors<SyncDto>;
    expect(sealed._isAsync).toBe(false);
  });

  it('async DTO는 _isAsync = true', async () => {
    await deserialize(AsyncDto, { name: 'Bob' });
    const sealed = (AsyncDto as any)[SEALED] as SealedExecutors<AsyncDto>;
    expect(sealed._isAsync).toBe(true);
  });

  it('sync DTO deserialize는 Promise를 반환하지만 async function이 아님', () => {
    const result = deserialize(SyncDto, { name: 'Alice', age: 30 });
    expect(result).toBeInstanceOf(Promise);
  });

  it('sync DTO deserialize 성공', async () => {
    const result = await deserialize(SyncDto, { name: 'Alice', age: 30 });
    expect(result.name).toBe('Alice');
    expect(result.age).toBe(30);
  });

  it('sync DTO 검증 실패 → rejected promise', async () => {
    await expect(
      deserialize(SyncDto, { name: 123, age: 'bad' }),
    ).rejects.toThrow('Validation failed');
  });

  it('async DTO deserialize 성공', async () => {
    const result = await deserialize(AsyncDto, { name: '  trimmed  ' });
    expect(result.name).toBe('trimmed');
  });
});

describe('sync API — serialize', () => {
  it('sync DTO는 _isSerializeAsync = false', async () => {
    await deserialize(SyncDto, { name: 'Alice', age: 30 });
    const sealed = (SyncDto as any)[SEALED] as SealedExecutors<SyncDto>;
    expect(sealed._isSerializeAsync).toBe(false);
  });

  it('sync DTO serialize 성공', async () => {
    const dto = Object.assign(new SyncDto(), { name: 'Bob', age: 25 });
    const result = await serialize(dto);
    expect(result).toEqual({ name: 'Bob', age: 25 });
  });

  it('serialize는 Promise를 반환', () => {
    const dto = Object.assign(new SyncDto(), { name: 'Bob', age: 25 });
    const result = serialize(dto);
    expect(result).toBeInstanceOf(Promise);
  });
});
