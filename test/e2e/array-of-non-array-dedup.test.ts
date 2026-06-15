import { describe, it, expect, beforeEach, afterEach } from 'bun:test';

import { Baker, Field, arrayOf, deserialize, isBakerIssueSet } from '../../index';
import { isNotEmpty, isByteLength } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

const baker = new Baker();

beforeEach(() => baker.seal());
afterEach(() => unseal());

@baker.Recipe
class MultiRuleArray {
  @Field(arrayOf(isNotEmpty, isByteLength(32)))
  secrets!: string[];
}

describe('arrayOf — non-array rejection is field-level, not per-rule', () => {
  it('emits a single isArray issue when the value is not an array, regardless of how many element rules are given', async () => {
    const r = await deserialize(MultiRuleArray, { secrets: 'not-an-array' });
    expect(isBakerIssueSet(r)).toBe(true);
    const issues = isBakerIssueSet(r) ? r.errors : [];
    const isArrayIssues = issues.filter(e => e.code === 'isArray');
    expect(isArrayIssues).toHaveLength(1);
    expect(isArrayIssues[0]!.path).toBe('secrets');
  });
});
