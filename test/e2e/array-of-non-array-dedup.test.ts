import { describe, it, expect, beforeEach } from 'bun:test';

import { Baker, Field, arrayOf, deserialize } from '../../index';
import { isNotEmpty, isByteLength } from '../../src/rules/index';
import { assertBakerIssueSet } from '../integration/helpers/assert';

const baker = new Baker();

beforeEach(() => baker.seal());

@baker.Recipe
class MultiRuleArray {
  @Field(arrayOf(isNotEmpty, isByteLength(32)))
  secrets!: string[];
}

describe('arrayOf — non-array rejection is field-level, not per-rule', () => {
  it('emits a single isArray issue when the value is not an array, regardless of how many element rules are given', async () => {
    const r = await deserialize(MultiRuleArray, { secrets: 'not-an-array' });
    assertBakerIssueSet(r);
    const isArrayIssues = r.errors.filter(e => e.code === 'isArray');
    expect(isArrayIssues).toHaveLength(1);
    expect(isArrayIssues[0]!.path).toBe('secrets');
  });
});
