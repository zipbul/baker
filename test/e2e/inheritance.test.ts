import { describe, it, expect, afterEach } from 'bun:test';
import { Field, deserialize, serialize, toJsonSchema, isBakerError } from '../../index';
import { isString, isNumber, isBoolean, min } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class BaseDto {
  @Field(isString)
  name!: string;
}

class ChildDto extends BaseDto {
  @Field(isNumber(), min(0))
  age!: number;
}

class GrandChildDto extends ChildDto {
  @Field(isBoolean)
  active!: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('inheritance — deserialize', () => {
  it('child → includes parent fields', async () => {
    const result = await deserialize<ChildDto>(ChildDto, { name: 'Alice', age: 25 }) as ChildDto;
    expect(result).toBeInstanceOf(ChildDto);
    expect(result.name).toBe('Alice');
    expect(result.age).toBe(25);
  });

  it('grandchild → includes all ancestor fields', async () => {
    const result = await deserialize<GrandChildDto>(GrandChildDto, {
      name: 'Bob', age: 30, active: true,
    }) as GrandChildDto;
    expect(result).toBeInstanceOf(GrandChildDto);
    expect(result.name).toBe('Bob');
    expect(result.age).toBe(30);
    expect(result.active).toBe(true);
  });

  it('parent rule violation → error in child too', async () => {
    // age: -1 violates min(0) from ChildDto
    const result = await deserialize(GrandChildDto, { name: 'X', age: -1, active: true });
    expect(isBakerError(result)).toBe(true);
  });
});

describe('inheritance — serialize', () => {
  it('child → serializes parent fields', async () => {
    const dto = Object.assign(new ChildDto(), { name: 'Carol', age: 40 });
    const result = await serialize(dto);
    expect(result).toEqual({ name: 'Carol', age: 40 });
  });

  it('grandchild → serializes all fields', async () => {
    const dto = Object.assign(new GrandChildDto(), { name: 'Dave', age: 35, active: false });
    const result = await serialize(dto);
    expect(result).toEqual({ name: 'Dave', age: 35, active: false });
  });
});

describe('inheritance — toJsonSchema', () => {
  it('grandchild schema includes all ancestor fields', () => {
    const schema = toJsonSchema(GrandChildDto);
    expect(schema.properties!.name).toBeDefined();
    expect(schema.properties!.age).toBeDefined();
    expect(schema.properties!.active).toBeDefined();
    expect(schema.properties!.age!.minimum).toBe(0);
  });
});
