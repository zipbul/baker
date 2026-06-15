import { describe, it, expect, beforeEach } from 'bun:test';

import { Baker, Field, BakerError, isBakerIssueSet } from '../../index';
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
    const r = baker.deserializeSync<SyncDto>(SyncDto, { name: 'x' }) as SyncDto;
    expect(r.name).toBe('x');
  });

  it('deserializeSync on async DTO throws BakerError', () => {
    expect(() => baker.deserializeSync(AsyncDeserDto, { name: 'x' })).toThrow(BakerError);
  });

  it('deserializeAsync on sync DTO returns Promise', async () => {
    const r = (await baker.deserializeAsync<SyncDto>(SyncDto, { name: 'x' })) as SyncDto;
    expect(r.name).toBe('x');
  });

  it('deserializeAsync on async DTO returns Promise', async () => {
    const r = (await baker.deserializeAsync<AsyncDeserDto>(AsyncDeserDto, { name: 'x' })) as AsyncDeserDto;
    expect(r.name).toBe('x');
  });

  it('deserializeSync surfaces BakerIssueSet', () => {
    const r = baker.deserializeSync(SyncDto, { name: 1 });
    expect(isBakerIssueSet(r)).toBe(true);
  });
});

describe('serializeSync / serializeAsync', () => {
  it('serializeSync on sync-serialize DTO returns object directly', () => {
    const dto = Object.assign(new SyncDto(), { name: 'x' });
    const r = baker.serializeSync(dto) as Record<string, unknown>;
    expect(r.name).toBe('x');
  });

  it('serializeSync on async-serialize DTO throws BakerError', () => {
    const dto = Object.assign(new AsyncSerDto(), { price: 1 });
    expect(() => baker.serializeSync(dto)).toThrow(BakerError);
  });

  it('serializeAsync on sync DTO returns Promise', async () => {
    const dto = Object.assign(new SyncDto(), { name: 'x' });
    const r = await baker.serializeAsync(dto);
    expect(r.name).toBe('x');
  });

  it('serializeAsync on async DTO returns Promise', async () => {
    const dto = Object.assign(new AsyncSerDto(), { price: 7 });
    const r = await baker.serializeAsync(dto);
    expect(r.price).toBe(7);
  });
});

describe('serializeSync / serializeAsync — defensive input checks', () => {
  it('serializeSync(null) throws BakerError', () => {
    expect(() => baker.serializeSync(null)).toThrow(/expected a class instance, got null/);
  });

  it('serializeSync(undefined) throws BakerError', () => {
    expect(() => baker.serializeSync(undefined)).toThrow(/expected a class instance, got undefined/);
  });

  it('serializeSync("string") throws BakerError', () => {
    expect(() => baker.serializeSync('hello')).toThrow(/expected a class instance, got string/);
  });

  it('serializeSync(Object.create(null)) throws "no constructor"', () => {
    const obj = Object.create(null);
    expect(() => baker.serializeSync(obj)).toThrow(/instance has no constructor/);
  });

  it('serializeAsync(null) throws BakerError', () => {
    expect(() => baker.serializeAsync(null)).toThrow(/expected a class instance/);
  });

  it('serializeAsync(undefined) throws BakerError', () => {
    expect(() => baker.serializeAsync(undefined)).toThrow(/expected a class instance/);
  });

  it('serializeAsync(Object.create(null)) throws "no constructor"', () => {
    const obj = Object.create(null);
    expect(() => baker.serializeAsync(obj)).toThrow(/instance has no constructor/);
  });
});

describe('validateSync / validateAsync', () => {
  it('validateSync on sync DTO returns true', () => {
    expect(baker.validateSync(SyncDto, { name: 'x' })).toBe(true);
  });

  it('validateSync on async DTO throws BakerError', () => {
    expect(() => baker.validateSync(AsyncDeserDto, { name: 'x' })).toThrow(BakerError);
  });

  it('validateAsync on sync DTO returns Promise<true>', async () => {
    expect(await baker.validateAsync(SyncDto, { name: 'x' })).toBe(true);
  });

  it('validateAsync on async DTO returns Promise', async () => {
    expect(await baker.validateAsync(AsyncDeserDto, { name: 'x' })).toBe(true);
  });

  it('validateSync surfaces BakerIssueSet on invalid input', () => {
    const r = baker.validateSync(SyncDto, { name: 1 });
    expect(isBakerIssueSet(r)).toBe(true);
  });
});

// A DTO can be async on deserialize-side but sync on serialize-side (and vice versa).
// `serializeSync` must work when only deserialize is async; `deserializeSync` must work
// when only serialize is async.
describe('strict variants — direction asymmetry', () => {
  it('async deserialize / sync serialize: serializeSync works', () => {
    const dto = Object.assign(new AsyncDeserDto(), { name: 'x' });
    const r = baker.serializeSync(dto) as Record<string, unknown>;
    expect(r.name).toBe('x');
  });

  it('sync deserialize / async serialize: deserializeSync works', () => {
    const r = baker.deserializeSync<AsyncSerDto>(AsyncSerDto, { price: 7 }) as AsyncSerDto;
    expect(r.price).toBe(7);
  });
});
