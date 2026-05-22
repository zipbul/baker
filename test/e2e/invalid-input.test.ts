import { describe, it, expect, afterEach, beforeEach } from 'bun:test';

import { Field, Recipe, deserialize, seal } from '../../index';
import { isString } from '../../src/rules/index';
import { assertBakerError } from '../integration/helpers/assert';
import { unseal } from '../integration/helpers/unseal';

beforeEach(() => seal());
afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

@Recipe
class SimpleDto {
  @Field(isString)
  name!: string;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('invalidInput error code', () => {
  it('null input → invalidInput', async () => {
    const result = await deserialize(SimpleDto, null);
    assertBakerError(result);
    const err = result.errors[0]!;
    expect(err.path).toBe('');
    expect(err.code).toBe('invalidInput');
  });

  it('undefined input → invalidInput', async () => {
    const result = await deserialize(SimpleDto, undefined);
    assertBakerError(result);
    expect(result.errors[0]!.code).toBe('invalidInput');
  });

  it('array input → invalidInput', async () => {
    const result = await deserialize(SimpleDto, [1, 2, 3]);
    assertBakerError(result);
    expect(result.errors[0]!.code).toBe('invalidInput');
  });

  it('string input → invalidInput', async () => {
    const result = await deserialize(SimpleDto, 'hello');
    assertBakerError(result);
    expect(result.errors[0]!.code).toBe('invalidInput');
  });

  it('number input → invalidInput', async () => {
    const result = await deserialize(SimpleDto, 42);
    assertBakerError(result);
    expect(result.errors[0]!.code).toBe('invalidInput');
  });

  it('valid object → passes', async () => {
    const result = (await deserialize(SimpleDto, { name: 'Alice' })) as SimpleDto;
    expect(result.name).toBe('Alice');
  });
});
