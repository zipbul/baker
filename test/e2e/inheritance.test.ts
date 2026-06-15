import { describe, it, expect, afterEach, beforeEach } from 'bun:test';

import { Baker, Field, deserialize, serialize, isBakerIssueSet } from '../../index';
import { isString, isNumber, isBoolean, min } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

const baker = new Baker();

beforeEach(() => baker.seal());
afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

@baker.Recipe
class BaseDto {
  @Field(isString)
  name!: string;
}

@baker.Recipe
class ChildDto extends BaseDto {
  @Field(isNumber(), min(0))
  age!: number;
}

@baker.Recipe
class GrandChildDto extends ChildDto {
  @Field(isBoolean)
  active!: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('inheritance — deserialize', () => {
  it('child → includes parent fields', async () => {
    const result = (await deserialize<ChildDto>(ChildDto, { name: 'Alice', age: 25 })) as ChildDto;
    expect(result).toBeInstanceOf(ChildDto);
    expect(result.name).toBe('Alice');
    expect(result.age).toBe(25);
  });

  it('grandchild → includes all ancestor fields', async () => {
    const result = (await deserialize<GrandChildDto>(GrandChildDto, {
      name: 'Bob',
      age: 30,
      active: true,
    })) as GrandChildDto;
    expect(result).toBeInstanceOf(GrandChildDto);
    expect(result.name).toBe('Bob');
    expect(result.age).toBe(30);
    expect(result.active).toBe(true);
  });

  it('parent rule violation → error in child too', async () => {
    // age: -1 violates min(0) from ChildDto
    const result = await deserialize(GrandChildDto, { name: 'X', age: -1, active: true });
    expect(isBakerIssueSet(result)).toBe(true);
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
