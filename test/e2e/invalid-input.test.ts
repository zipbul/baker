import { describe, it, expect, afterEach } from 'bun:test';
import { Field, deserialize, BakerValidationError } from '../../index';
import { isString } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class SimpleDto {
  @Field(isString)
  name!: string;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('invalidInput error code', () => {
  it('null input → invalidInput', async () => {
    try {
      await deserialize(SimpleDto, null);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BakerValidationError);
      const err = (e as BakerValidationError).errors[0]!;
      expect(err.path).toBe('');
      expect(err.code).toBe('invalidInput');
    }
  });

  it('undefined input → invalidInput', async () => {
    try {
      await deserialize(SimpleDto, undefined);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BakerValidationError);
      expect((e as BakerValidationError).errors[0]!.code).toBe('invalidInput');
    }
  });

  it('array input → invalidInput', async () => {
    try {
      await deserialize(SimpleDto, [1, 2, 3]);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BakerValidationError);
      expect((e as BakerValidationError).errors[0]!.code).toBe('invalidInput');
    }
  });

  it('string input → invalidInput', async () => {
    try {
      await deserialize(SimpleDto, 'hello');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BakerValidationError);
      expect((e as BakerValidationError).errors[0]!.code).toBe('invalidInput');
    }
  });

  it('number input → invalidInput', async () => {
    try {
      await deserialize(SimpleDto, 42);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BakerValidationError);
      expect((e as BakerValidationError).errors[0]!.code).toBe('invalidInput');
    }
  });

  it('valid object → passes', async () => {
    const result = await deserialize<SimpleDto>(SimpleDto, { name: 'Alice' });
    expect(result.name).toBe('Alice');
  });
});
