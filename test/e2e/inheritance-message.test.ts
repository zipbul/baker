import { describe, it, expect } from 'bun:test';

import { Baker, Field } from '../../index';
import { isString, minLength } from '../../src/rules/index';
import { assertBakerIssueSet } from '../integration/helpers/assert';

const baker = new Baker();

@baker.Recipe
class MsgParent {
  @Field(isString, { message: 'parent message', context: { from: 'parent' } })
  name!: string;
}

// Child re-declares `name` (adding a rule) WITHOUT its own message/context. Field-level
// message/context must inherit from the parent, mirroring how type/expose/exclude/transform inherit.
@baker.Recipe
class MsgChild extends MsgParent {
  @Field(isString, minLength(3))
  override name = '';
}

// Child that re-declares `name` WITH its own message → child wins (no inheritance).
@baker.Recipe
class MsgOverrideChild extends MsgParent {
  @Field(isString, minLength(3), { message: 'child message' })
  override name = '';
}

baker.seal();

describe('inheritance — field-level message/context', () => {
  it('child overriding a field without a message inherits the parent field message', async () => {
    const result = await baker.deserialize(MsgChild, { name: 'ab' });
    assertBakerIssueSet(result);
    const err = result.errors.find(e => e.code === 'minLength');
    expect(err).toBeDefined();
    expect(err!.message).toBe('parent message');
  });

  it('child overriding a field without a context inherits the parent field context', async () => {
    const result = await baker.deserialize(MsgChild, { name: 'ab' });
    assertBakerIssueSet(result);
    const err = result.errors.find(e => e.code === 'minLength');
    expect(err!.context).toEqual({ from: 'parent' });
  });

  it('child supplying its own message overrides the parent message', async () => {
    const result = await baker.deserialize(MsgOverrideChild, { name: 'ab' });
    assertBakerIssueSet(result);
    const err = result.errors.find(e => e.code === 'minLength');
    expect(err!.message).toBe('child message');
  });
});
