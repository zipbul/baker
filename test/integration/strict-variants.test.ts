import { describe, it, expect, beforeEach, afterEach } from 'bun:test';

import {
  Field,
  deserializeSync,
  deserializeAsync,
  validateSync,
  validateAsync,
  serializeSync,
  serializeAsync,
  SealError,
  seal,
  isBakerError,
} from '../../index';
import { isString, isNumber } from '../../src/rules/index';
import { unseal } from './helpers/unseal';

class SyncDto {
  @Field(isString) name!: string;
}

class AsyncDeserDto {
  @Field(isString, {
    transform: { deserialize: async ({ value }) => value, serialize: ({ value }) => value },
  })
  name!: string;
}

class AsyncSerDto {
  @Field(isNumber(), {
    transform: { deserialize: ({ value }) => value, serialize: async ({ value }) => value },
  })
  price!: number;
}

beforeEach(() => seal());
afterEach(() => unseal());

describe('deserializeSync / deserializeAsync', () => {
  it('deserializeSync on sync DTO returns value directly', () => {
    const r = deserializeSync<SyncDto>(SyncDto, { name: 'x' }) as SyncDto;
    expect(r.name).toBe('x');
  });

  it('deserializeSync on async DTO throws SealError', () => {
    expect(() => deserializeSync(AsyncDeserDto, { name: 'x' })).toThrow(SealError);
  });

  it('deserializeAsync on sync DTO returns Promise', async () => {
    const r = (await deserializeAsync<SyncDto>(SyncDto, { name: 'x' })) as SyncDto;
    expect(r.name).toBe('x');
  });

  it('deserializeAsync on async DTO returns Promise', async () => {
    const r = (await deserializeAsync<AsyncDeserDto>(AsyncDeserDto, { name: 'x' })) as AsyncDeserDto;
    expect(r.name).toBe('x');
  });

  it('deserializeSync surfaces BakerErrors', () => {
    const r = deserializeSync(SyncDto, { name: 1 });
    expect(isBakerError(r)).toBe(true);
  });
});

describe('serializeSync / serializeAsync', () => {
  it('serializeSync on sync-serialize DTO returns object directly', () => {
    const dto = Object.assign(new SyncDto(), { name: 'x' });
    const r = serializeSync(dto) as Record<string, unknown>;
    expect(r.name).toBe('x');
  });

  it('serializeSync on async-serialize DTO throws SealError', () => {
    const dto = Object.assign(new AsyncSerDto(), { price: 1 });
    expect(() => serializeSync(dto)).toThrow(SealError);
  });

  it('serializeAsync on sync DTO returns Promise', async () => {
    const dto = Object.assign(new SyncDto(), { name: 'x' });
    const r = await serializeAsync(dto);
    expect(r.name).toBe('x');
  });

  it('serializeAsync on async DTO returns Promise', async () => {
    const dto = Object.assign(new AsyncSerDto(), { price: 7 });
    const r = await serializeAsync(dto);
    expect(r.price).toBe(7);
  });
});

describe('serializeSync / serializeAsync — defensive input checks', () => {
  it('serializeSync(null) throws SealError', () => {
    expect(() => serializeSync(null)).toThrow(/expected a class instance, got null/);
  });

  it('serializeSync(undefined) throws SealError', () => {
    expect(() => serializeSync(undefined)).toThrow(/expected a class instance, got undefined/);
  });

  it('serializeSync("string") throws SealError', () => {
    expect(() => serializeSync('hello')).toThrow(/expected a class instance, got string/);
  });

  it('serializeSync(Object.create(null)) throws "no constructor"', () => {
    const obj = Object.create(null);
    expect(() => serializeSync(obj)).toThrow(/instance has no constructor/);
  });

  it('serializeAsync(null) throws SealError', () => {
    expect(() => serializeAsync(null)).toThrow(/expected a class instance/);
  });

  it('serializeAsync(undefined) throws SealError', () => {
    expect(() => serializeAsync(undefined)).toThrow(/expected a class instance/);
  });

  it('serializeAsync(Object.create(null)) throws "no constructor"', () => {
    const obj = Object.create(null);
    expect(() => serializeAsync(obj)).toThrow(/instance has no constructor/);
  });
});

describe('validateSync / validateAsync', () => {
  it('validateSync on sync DTO returns true', () => {
    expect(validateSync(SyncDto, { name: 'x' })).toBe(true);
  });

  it('validateSync on async DTO throws SealError', () => {
    expect(() => validateSync(AsyncDeserDto, { name: 'x' })).toThrow(SealError);
  });

  it('validateAsync on sync DTO returns Promise<true>', async () => {
    expect(await validateAsync(SyncDto, { name: 'x' })).toBe(true);
  });

  it('validateAsync on async DTO returns Promise', async () => {
    expect(await validateAsync(AsyncDeserDto, { name: 'x' })).toBe(true);
  });

  it('validateSync surfaces BakerErrors on invalid input', () => {
    const r = validateSync(SyncDto, { name: 1 });
    expect(isBakerError(r)).toBe(true);
  });
});

// A DTO can be async on deserialize-side but sync on serialize-side (and vice versa).
// `serializeSync` must work when only deserialize is async; `deserializeSync` must work
// when only serialize is async.
describe('strict variants — direction asymmetry', () => {
  it('async deserialize / sync serialize: serializeSync works', () => {
    const dto = Object.assign(new AsyncDeserDto(), { name: 'x' });
    const r = serializeSync(dto) as Record<string, unknown>;
    expect(r.name).toBe('x');
  });

  it('sync deserialize / async serialize: deserializeSync works', () => {
    const r = deserializeSync<AsyncSerDto>(AsyncSerDto, { price: 7 }) as AsyncSerDto;
    expect(r.price).toBe(7);
  });
});
