import { describe, it, expect, afterEach } from 'bun:test';
import { serialize, Field } from '../../index';
import { isString, isNumber } from '../../src/rules/index';
import { unseal } from './helpers/unseal';

// ─── DTOs ────────────────────────────────────────────────────────────────────

class SimpleSerializeDto {
  @Field(isString)
  name!: string;

  @Field(isNumber())
  age!: number;
}

class ExposedDto {
  @Field(isString, { name: 'full_name' })
  name!: string;

  @Field(isNumber())
  age!: number;
}

class ExcludedDto {
  @Field(isString)
  public!: string;

  @Field(isString, { exclude: true })
  private!: string;
}

// ─────────────────────────────────────────────────────────────────────────────

afterEach(() => unseal());

describe('serialize — integration', () => {
  it('should serialize DTO instance to plain object', async () => {
    const dto = Object.assign(new SimpleSerializeDto(), { name: 'Bob', age: 25 });
    const result = await serialize(dto);
    expect(result).toEqual({ name: 'Bob', age: 25 });
  });

  it('should apply @Field name option when serializing', async () => {
    const dto = Object.assign(new ExposedDto(), { name: 'Carol', age: 40 });
    const result = await serialize(dto);
    expect(result['full_name']).toBe('Carol');
    expect(result['name']).toBeUndefined();
  });

  it('should omit @Exclude fields', async () => {
    const dto = Object.assign(new ExcludedDto(), { public: 'visible', private: 'hidden' });
    const result = await serialize(dto);
    expect(result['public']).toBe('visible');
    expect(result['private']).toBeUndefined();
  });

  it('should return plain object (not class instance)', async () => {
    const dto = Object.assign(new SimpleSerializeDto(), { name: 'Eve', age: 28 });
    const result = await serialize(dto);
    expect(typeof result).toBe('object');
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  });

  it('serialize is a regular function, not an async function', () => {
    expect(serialize.constructor.name).toBe('Function');
  });

  it('sync DTO serialize returns direct value', () => {
    const dto = Object.assign(new SimpleSerializeDto(), { name: 'Test', age: 1 });
    const result = serialize(dto);
    expect(result).toEqual({ name: 'Test', age: 1 });
  });
});
