import { describe, it, expect, afterEach, beforeEach } from 'bun:test';
import { deserialize, isBakerError, Field, configure } from '../../index';
import type { BakerErrors } from '../../index';
import { isString, isNumber, isEmail, min } from '../../src/rules/index';
import { unseal } from './helpers/unseal';

// ─── DTOs ────────────────────────────────────────────────────────────────────

class ErrorDto {
  @Field(isString)
  name!: string;

  @Field(isNumber(), min(0))
  age!: number;

  @Field(isEmail())
  email!: string;
}

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
afterEach(() => { unseal(); configure({}); });

describe('error — integration', () => {
  it('should return BakerErrors on invalid input', async () => {
    const result = await deserialize(ErrorDto, { name: 123, age: 25, email: 'x@y.com' });
    expect(isBakerError(result)).toBe(true);
  });

  it('BakerErrors should have errors array', async () => {
    const result = await deserialize(ErrorDto, { name: 123, age: 25, email: 'x@y.com' });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors).toBeArray();
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it('BakerErrors.errors should include path and code', async () => {
    const result = await deserialize(ErrorDto, { age: 25, email: 'x@y.com' });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors.some(err => err.path === 'name')).toBe(true);
    }
  });

  it('should collect all errors when multiple fields invalid', async () => {
    const result = await deserialize(MultiFieldErrorDto, { a: 1, b: 2, c: 3 });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('should respect stopAtFirstError configure option', async () => {
    configure({ stopAtFirstError: true });
    const result = await deserialize(MultiFieldErrorDto, { a: 1, b: 2, c: 3 });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors.length).toBe(1);
    }
  });
});
