import { describe, it, expect, afterEach, beforeEach } from 'bun:test';

import type { SealedExecutors } from '../../src/types';

import { Field, deserialize, serialize, isBakerError, seal } from '../../index';
import { isString, isNumber } from '../../src/rules/index';
import { SEALED } from '../../src/symbols';
import { unseal } from '../integration/helpers/unseal';

beforeEach(() => seal());
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
    transform: {
      deserialize: async ({ value }) => (typeof value === 'string' ? value.trim() : value),
      serialize: ({ value }) => value,
    },
  })
  name!: string;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('dual sync/async API — deserialize', () => {
  it('sync DTO has isAsync = false', async () => {
    await deserialize(SyncDto, { name: 'Alice', age: 30 });
    const sealed = (SyncDto as any)[SEALED] as SealedExecutors<SyncDto>;
    expect(sealed.isAsync).toBe(false);
  });

  it('async DTO has isAsync = true', async () => {
    await deserialize(AsyncDto, { name: 'Bob' });
    const sealed = (AsyncDto as any)[SEALED] as SealedExecutors<AsyncDto>;
    expect(sealed.isAsync).toBe(true);
  });

  it('sync DTO deserialize returns direct value', () => {
    const result = deserialize(SyncDto, { name: 'Alice', age: 30 });
    expect(result).toBeInstanceOf(SyncDto);
  });

  it('sync DTO deserialize succeeds', async () => {
    const result = (await deserialize(SyncDto, { name: 'Alice', age: 30 })) as SyncDto;
    expect(result.name).toBe('Alice');
    expect(result.age).toBe(30);
  });

  it('sync DTO validation failure → rejected promise', async () => {
    const result = await deserialize(SyncDto, { name: 123, age: 'bad' });
    expect(isBakerError(result)).toBe(true);
  });

  it('async DTO deserialize succeeds', async () => {
    const result = (await deserialize(AsyncDto, { name: '  trimmed  ' })) as AsyncDto;
    expect(result.name).toBe('trimmed');
  });
});

describe('dual sync/async API — serialize', () => {
  it('sync DTO has isSerializeAsync = false', async () => {
    await deserialize(SyncDto, { name: 'Alice', age: 30 });
    const sealed = (SyncDto as any)[SEALED] as SealedExecutors<SyncDto>;
    expect(sealed.isSerializeAsync).toBe(false);
  });

  it('sync DTO serialize succeeds', async () => {
    const dto = Object.assign(new SyncDto(), { name: 'Bob', age: 25 });
    const result = await serialize(dto);
    expect(result).toEqual({ name: 'Bob', age: 25 });
  });

  it('sync DTO serialize returns direct value', () => {
    const dto = Object.assign(new SyncDto(), { name: 'Bob', age: 25 });
    const result = serialize(dto);
    expect(result).toEqual({ name: 'Bob', age: 25 });
  });
});
