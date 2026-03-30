import { describe, it, expect, afterEach } from 'bun:test';
import { Field, deserialize, isBakerError } from '../../index';
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
    const result = await deserialize(SimpleDto, null);
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      const err = result.errors[0]!;
      expect(err.path).toBe('');
      expect(err.code).toBe('invalidInput');
    }
  });

  it('undefined input → invalidInput', async () => {
    const result = await deserialize(SimpleDto, undefined);
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors[0]!.code).toBe('invalidInput');
    }
  });

  it('array input → invalidInput', async () => {
    const result = await deserialize(SimpleDto, [1, 2, 3]);
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors[0]!.code).toBe('invalidInput');
    }
  });

  it('string input → invalidInput', async () => {
    const result = await deserialize(SimpleDto, 'hello');
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors[0]!.code).toBe('invalidInput');
    }
  });

  it('number input → invalidInput', async () => {
    const result = await deserialize(SimpleDto, 42);
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors[0]!.code).toBe('invalidInput');
    }
  });

  it('valid object → passes', async () => {
    const result = await deserialize(SimpleDto, { name: 'Alice' }) as SimpleDto;
    expect(result.name).toBe('Alice');
  });
});
