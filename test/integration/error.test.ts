import { describe, it, expect, afterEach, beforeEach } from 'bun:test';

import { deserialize, isBakerIssueSet, Field, Recipe, configure, seal } from '../../index';
import { isString, isNumber, isEmail, min } from '../../src/rules/index';
import { assertBakerIssueSet } from './helpers/assert';
import { unseal } from './helpers/unseal';

// ─── DTOs ────────────────────────────────────────────────────────────────────

@Recipe
class ErrorDto {
  @Field(isString)
  name!: string;

  @Field(isNumber(), min(0))
  age!: number;

  @Field(isEmail())
  email!: string;
}

@Recipe
class MultiFieldErrorDto {
  @Field(isString)
  a!: string;

  @Field(isString)
  b!: string;

  @Field(isString)
  c!: string;
}

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => unseal());
afterEach(() => {
  unseal();
  configure({});
});

describe('error — integration', () => {
  it('should return BakerIssueSet on invalid input', async () => {
    seal();
    const result = await deserialize(ErrorDto, { name: 123, age: 25, email: 'x@y.com' });
    expect(isBakerIssueSet(result)).toBe(true);
  });

  it('BakerIssueSet should have errors array', async () => {
    seal();
    const result = await deserialize(ErrorDto, { name: 123, age: 25, email: 'x@y.com' });
    assertBakerIssueSet(result);
    expect(result.errors).toBeArray();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('BakerIssueSet.errors should include path and code', async () => {
    seal();
    const result = await deserialize(ErrorDto, { age: 25, email: 'x@y.com' });
    assertBakerIssueSet(result);
    expect(result.errors.some(err => err.path === 'name')).toBe(true);
  });

  it('should collect all errors when multiple fields invalid', async () => {
    seal();
    const result = await deserialize(MultiFieldErrorDto, { a: 1, b: 2, c: 3 });
    assertBakerIssueSet(result);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });

  it('should respect stopAtFirstError configure option', async () => {
    configure({ stopAtFirstError: true });
    seal();
    const result = await deserialize(MultiFieldErrorDto, { a: 1, b: 2, c: 3 });
    assertBakerIssueSet(result);
    expect(result.errors.length).toBe(1);
  });
});
