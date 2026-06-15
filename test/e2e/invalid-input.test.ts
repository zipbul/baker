import { describe, it, expect, afterEach, beforeEach } from 'bun:test';

import { Baker, Field, deserialize } from '../../index';
import { isString } from '../../src/rules/index';
import { assertBakerIssueSet } from '../integration/helpers/assert';
import { unseal } from '../integration/helpers/unseal';

const baker = new Baker();

beforeEach(() => baker.seal());
afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

@baker.Recipe
class SimpleDto {
  @Field(isString)
  name!: string;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('invalidInput error code', () => {
  it('null input → invalidInput', async () => {
    const result = await deserialize(SimpleDto, null);
    assertBakerIssueSet(result);
    const err = result.errors[0]!;
    expect(err.path).toBe('');
    expect(err.code).toBe('invalidInput');
  });

  it('undefined input → invalidInput', async () => {
    const result = await deserialize(SimpleDto, undefined);
    assertBakerIssueSet(result);
    expect(result.errors[0]!.code).toBe('invalidInput');
  });

  it('array input → invalidInput', async () => {
    const result = await deserialize(SimpleDto, [1, 2, 3]);
    assertBakerIssueSet(result);
    expect(result.errors[0]!.code).toBe('invalidInput');
  });

  it('string input → invalidInput', async () => {
    const result = await deserialize(SimpleDto, 'hello');
    assertBakerIssueSet(result);
    expect(result.errors[0]!.code).toBe('invalidInput');
  });

  it('number input → invalidInput', async () => {
    const result = await deserialize(SimpleDto, 42);
    assertBakerIssueSet(result);
    expect(result.errors[0]!.code).toBe('invalidInput');
  });

  it('valid object → passes', async () => {
    const result = (await deserialize(SimpleDto, { name: 'Alice' })) as SimpleDto;
    expect(result.name).toBe('Alice');
  });
});
