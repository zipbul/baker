import { describe, it, expect } from 'bun:test';

import { Baker, Field } from '../../index';
import { arrayOf } from '../../src/decorators/field';
import { minLength } from '../../src/rules/index';
import { assertBakerIssueSet } from '../integration/helpers/assert';

const baker = new Baker();

@baker.Recipe
class SetEachGroupDto {
  // Set field whose per-element rule inherits the field group. The whole field — including its
  // element rules — is gated by the field-level group check, so a non-matching runtime group skips it.
  @Field(arrayOf(minLength(3)), { type: () => Set, groups: ['admin'] })
  tags!: Set<string>;
}

baker.seal();

describe('Set field + grouped each-rule + runtime groups', () => {
  it('skips the field and its element rules when the runtime group does not match', async () => {
    const result = (await baker.deserialize(SetEachGroupDto, { tags: ['ok', 'no'] }, { groups: ['viewer'] })) as {
      tags?: unknown;
    };
    expect((result as { errors?: unknown }).errors).toBeUndefined();
    expect(result.tags).toBeUndefined();
  });

  it('runs the element rule when the runtime group matches', async () => {
    const result = await baker.deserialize(SetEachGroupDto, { tags: ['ok', 'no'] }, { groups: ['admin'] });
    assertBakerIssueSet(result);
    expect(result.errors.some(e => e.code === 'minLength')).toBe(true);
  });
});
