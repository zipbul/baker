import { describe, it, expect, beforeEach } from 'bun:test';

import { Baker, Field, deserializeSync, deserializeAsync, validateSync, validateAsync, serializeSync, serializeAsync, BakerError, isBakerIssueSet } from '../../index';
import { isString, isNumber } from '../../src/rules/index';

const baker = new Baker();

@baker.Recipe
class SyncDto {
  @Field(isString) name!: string;
}

@baker.Recipe
class AsyncDeserDto {
  @Field(isString, {
    transform: { deserialize: async ({ value }) => value, serialize: ({ value }) => value },
  })
  name!: string;
}

@baker.Recipe
class AsyncSerDto {
  @Field(isNumber(), {
    transform: { deserialize: ({ value }) => value, serialize: async ({ value }) => value },
  })
  price!: number;
}

beforeEach(() => baker.seal());

describe('deserializeSync / deserializeAsync', () => {
  it('deserializeSync on sync DTO returns value directly', () => {
    const r = deserializeSync<SyncDto>(SyncDto, { name: 'x' }) as SyncDto;
    expect(r.name).toBe('x');
  });

  it('deserializeSync on async DTO throws BakerError', () => {
    expect(() => deserializeSync(AsyncDeserDto, { name: 'x' })).toThrow(BakerError);
  });

  it('deserializeAsync on sync DTO returns Promise', async () => {
    const r = (await deserializeAsync<SyncDto>(SyncDto, { name: 'x' })) as SyncDto;
    expect(r.name).toBe('x');
  });

  it('deserializeAsync on async DTO returns Promise', async () => {
    const r = (await deserializeAsync<AsyncDeserDto>(AsyncDeserDto, { name: 'x' })) as AsyncDeserDto;
    expect(r.name).toBe('x');
  });

  it('deserializeSync surfaces BakerIssueSet', () => {
    const r = deserializeSync(SyncDto, { name: 1 });
    expect(isBakerIssueSet(r)).toBe(true);
  });
});

describe('serializeSync / serializeAsync', () => {
  it('serializeSync on sync-serialize DTO returns object directly', () => {
    const dto = Object.assign(new SyncDto(), { name: 'x' });
    const r = serializeSync(dto) as Record<string, unknown>;
    expect(r.name).toBe('x');
  });

  it('serializeSync on async-serialize DTO throws BakerError', () => {
    const dto = Object.assign(new AsyncSerDto(), { price: 1 });
    expect(() => serializeSync(dto)).toThrow(BakerError);
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
  it('serializeSync(null) throws BakerError', () => {
    expect(() => serializeSync(null)).toThrow(/expected a class instance, got null/);
  });

  it('serializeSync(undefined) throws BakerError', () => {
    expect(() => serializeSync(undefined)).toThrow(/expected a class instance, got undefined/);
  });

  it('serializeSync("string") throws BakerError', () => {
    expect(() => serializeSync('hello')).toThrow(/expected a class instance, got string/);
  });

  it('serializeSync(Object.create(null)) throws "no constructor"', () => {
    const obj = Object.create(null);
    expect(() => serializeSync(obj)).toThrow(/instance has no constructor/);
  });

  it('serializeAsync(null) throws BakerError', () => {
    expect(() => serializeAsync(null)).toThrow(/expected a class instance/);
  });

  it('serializeAsync(undefined) throws BakerError', () => {
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

  it('validateSync on async DTO throws BakerError', () => {
    expect(() => validateSync(AsyncDeserDto, { name: 'x' })).toThrow(BakerError);
  });

  it('validateAsync on sync DTO returns Promise<true>', async () => {
    expect(await validateAsync(SyncDto, { name: 'x' })).toBe(true);
  });

  it('validateAsync on async DTO returns Promise', async () => {
    expect(await validateAsync(AsyncDeserDto, { name: 'x' })).toBe(true);
  });

  it('validateSync surfaces BakerIssueSet on invalid input', () => {
    const r = validateSync(SyncDto, { name: 1 });
    expect(isBakerIssueSet(r)).toBe(true);
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
