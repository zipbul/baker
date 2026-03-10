import { describe, it, expect, afterEach } from 'bun:test';
import { deserialize, BakerValidationError, Field, configure } from '../../index';
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

afterEach(() => { unseal(); configure({}); });

describe('error — integration', () => {
  it('should throw BakerValidationError on invalid input', async () => {
    await expect(deserialize(ErrorDto, { name: 123, age: 25, email: 'x@y.com' })).rejects.toThrow(BakerValidationError);
  });

  it('BakerValidationError should have errors array', async () => {
    try {
      await deserialize(ErrorDto, { name: 123, age: 25, email: 'x@y.com' });
      expect(true).toBe(false); // should not reach
    } catch (e) {
      expect(e).toBeInstanceOf(BakerValidationError);
      expect((e as BakerValidationError).errors).toBeArray();
      expect((e as BakerValidationError).errors.length).toBeGreaterThan(0);
    }
  });

  it('BakerValidationError.errors should include path and code', async () => {
    try {
      await deserialize(ErrorDto, { age: 25, email: 'x@y.com' }); // missing required name
      expect(true).toBe(false);
    } catch (e) {
      expect(e).toBeInstanceOf(BakerValidationError);
      const errors = (e as BakerValidationError).errors;
      expect(errors.some(err => err.path === 'name')).toBe(true);
    }
  });

  it('should collect all errors when multiple fields invalid', async () => {
    try {
      await deserialize(MultiFieldErrorDto, { a: 1, b: 2, c: 3 }); // all invalid
      expect(true).toBe(false);
    } catch (e) {
      expect(e).toBeInstanceOf(BakerValidationError);
      expect((e as BakerValidationError).errors.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('should respect stopAtFirstError configure option', async () => {
    configure({ stopAtFirstError: true });
    try {
      await deserialize(MultiFieldErrorDto, { a: 1, b: 2, c: 3 });
      expect(true).toBe(false);
    } catch (e) {
      expect(e).toBeInstanceOf(BakerValidationError);
      // stopAtFirstError: collecting stopped at first error
      expect((e as BakerValidationError).errors.length).toBe(1);
    }
  });

  // ─── DX-2: BakerValidationError should include class name in message ───────

  it('should include class name in BakerValidationError.message', async () => {
    try {
      await deserialize(ErrorDto, { name: 123, age: 25, email: 'x@y.com' });
      expect(true).toBe(false);
    } catch (e) {
      expect(e).toBeInstanceOf(BakerValidationError);
      expect((e as BakerValidationError).message).toContain('ErrorDto');
      expect((e as BakerValidationError).message).toMatch(/Validation failed for ErrorDto: \d+ error/);
      expect((e as BakerValidationError).className).toBe('ErrorDto');
    }
  });
});
