import { describe, it, expect, afterEach, beforeEach } from 'bun:test';

import { Field, Recipe, deserialize, configure, isBakerError, seal } from '../../index';
import { isString, isNumber, isEmail } from '../../src/rules/index';
import { assertBakerError } from '../integration/helpers/assert';
import { unseal } from '../integration/helpers/unseal';

beforeEach(() => unseal());
afterEach(() => {
  unseal();
  configure({});
});

// ─────────────────────────────────────────────────────────────────────────────

@Recipe
class MultiDto {
  @Field(isString)
  a!: string;

  @Field(isString)
  b!: string;

  @Field(isString)
  c!: string;
}

@Recipe
class MessageDto {
  @Field(isString, { message: 'name must be a string' })
  name!: string;
}

@Recipe
class MessageFnDto {
  @Field(isNumber(), { message: ({ property, value }) => `${property}(${value}) is not a number` })
  score!: number;
}

@Recipe
class ContextDto {
  @Field(isEmail(), { context: { severity: 'critical' } })
  email!: string;
}

@Recipe
class ClassNameDto {
  @Field(isString)
  field!: string;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('error handling — stopAtFirstError', () => {
  it('stopAtFirstError: true → only 1 error', async () => {
    configure({ stopAtFirstError: true });
    seal();
    const result = await deserialize(MultiDto, { a: 1, b: 2, c: 3 });
    assertBakerError(result);
    expect(result.errors.length).toBe(1);
  });

  it('stopAtFirstError: false (default) → collects all errors', async () => {
    seal();
    const result = await deserialize(MultiDto, { a: 1, b: 2, c: 3 });
    assertBakerError(result);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe('error handling — custom message', () => {
  it('string message', async () => {
    seal();
    const result = await deserialize(MessageDto, { name: 123 });
    assertBakerError(result);
    const err = result.errors.find(e => e.path === 'name');
    expect(err!.message).toBe('name must be a string');
  });

  it('function message', async () => {
    seal();
    const result = await deserialize(MessageFnDto, { score: 'abc' });
    assertBakerError(result);
    const err = result.errors.find(e => e.path === 'score');
    expect(err!.message).toContain('score');
    expect(err!.message).toContain('abc');
  });
});

describe('error handling — context', () => {
  it('includes context object', async () => {
    seal();
    const result = await deserialize(ContextDto, { email: 'not-email' });
    assertBakerError(result);
    const err = result.errors.find(e => e.path === 'email');
    expect(err!.context).toEqual({ severity: 'critical' });
  });
});

describe('error handling — className', () => {
  it('validation fails for ClassNameDto', async () => {
    seal();
    const result = await deserialize(ClassNameDto, { field: 42 });
    expect(isBakerError(result)).toBe(true);
  });
});
