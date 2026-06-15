import { describe, it, expect, beforeEach } from 'bun:test';

import { Baker, Field, isBakerIssueSet } from '../../index';
import { isString, isNumber } from '../../src/rules/index';

const baker = new Baker();

beforeEach(() => baker.seal());

// ─── sync DTO (no async transform) ──────────────────────────────────────────

@baker.Recipe
class SyncDto {
  @Field(isString)
  name!: string;

  @Field(isNumber())
  age!: number;
}

// ─── async DTO (has async transform) ────────────────────────────────────────

@baker.Recipe
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
  it('sync DTO deserialize runs synchronously (not a Promise)', () => {
    const result = baker.deserialize(SyncDto, { name: 'Alice', age: 30 });
    expect(result).not.toBeInstanceOf(Promise);
  });

  it('async DTO deserialize runs asynchronously (returns a Promise)', () => {
    const result = baker.deserialize(AsyncDto, { name: 'Bob' });
    expect(result).toBeInstanceOf(Promise);
  });

  it('sync DTO deserialize returns direct value', () => {
    const result = baker.deserialize(SyncDto, { name: 'Alice', age: 30 });
    expect(result).toBeInstanceOf(SyncDto);
  });

  it('sync DTO deserialize succeeds', async () => {
    const result = (await baker.deserialize(SyncDto, { name: 'Alice', age: 30 })) as SyncDto;
    expect(result.name).toBe('Alice');
    expect(result.age).toBe(30);
  });

  it('sync DTO validation failure → rejected promise', async () => {
    const result = await baker.deserialize(SyncDto, { name: 123, age: 'bad' });
    expect(isBakerIssueSet(result)).toBe(true);
  });

  it('async DTO deserialize succeeds', async () => {
    const result = (await baker.deserialize(AsyncDto, { name: '  trimmed  ' })) as AsyncDto;
    expect(result.name).toBe('trimmed');
  });
});

describe('dual sync/async API — serialize', () => {
  it('sync DTO serialize runs synchronously (not a Promise)', () => {
    const dto = Object.assign(new SyncDto(), { name: 'Alice', age: 30 });
    const result = baker.serialize(dto);
    expect(result).not.toBeInstanceOf(Promise);
  });

  it('sync DTO serialize succeeds', async () => {
    const dto = Object.assign(new SyncDto(), { name: 'Bob', age: 25 });
    const result = await baker.serialize(dto);
    expect(result).toEqual({ name: 'Bob', age: 25 });
  });

  it('sync DTO serialize returns direct value', () => {
    const dto = Object.assign(new SyncDto(), { name: 'Bob', age: 25 });
    const result = baker.serialize(dto);
    expect(result).toEqual({ name: 'Bob', age: 25 });
  });
});
