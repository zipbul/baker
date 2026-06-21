import { describe, it, expect } from 'bun:test';

import { Baker, Field } from '../../index';
import { arrayOf } from '../../src/decorators/field';
import { minLength } from '../../src/rules/index';
import { assertBakerIssueSet } from '../integration/helpers/assert';

const baker = new Baker();

// Two validate-only Set fields whose sanitized keys are in a prefix relationship ('tag' ⊂ 'tags').
// A substring-based dedup of the generated path-prefix var would skip declaring `__bk$ep_tag`,
// producing a ReferenceError in the validate executor when a 'tag' element fails.
@baker.Recipe
class PrefixSetDto {
  @Field(arrayOf(minLength(2)), { type: () => Set })
  tags!: Set<string>;

  @Field(arrayOf(minLength(2)), { type: () => Set })
  tag!: Set<string>;
}

baker.seal();

describe('validate — prefix-colliding Set field keys', () => {
  it('reports element errors without a ReferenceError from a skipped path-prefix var', async () => {
    const result = await baker.validate(PrefixSetDto, { tags: ['ok'], tag: ['x'] });
    assertBakerIssueSet(result);
    const tagErr = result.errors.find(e => e.path.startsWith('tag['));
    expect(tagErr).toBeDefined();
    expect(tagErr!.code).toBe('minLength');
  });
});
