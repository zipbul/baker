import { describe, it, expect, beforeEach } from 'bun:test';

import { Baker, Field } from '../../index';
import { isString } from '../../src/rules/index';
import { assertBakerIssueSet } from '../integration/helpers/assert';

const baker = new Baker();

beforeEach(() => baker.seal());

// ─────────────────────────────────────────────────────────────────────────────

@baker.Recipe
class TreeNode {
  @Field(isString)
  value!: string;

  @Field({ optional: true, type: () => TreeNode })
  child?: TreeNode;
}

// ─── Cycle introduced only through an inherited @Type field ──────────────────
// InheritedBase declares `next: () => InheritedDerived`; InheritedDerived extends it and inherits
// that field → InheritedDerived -> InheritedDerived is a cycle visible only in the merged metadata.
@baker.Recipe
class InheritedBase {
  @Field(isString)
  value!: string;

  @Field({ optional: true, type: () => InheritedDerived })
  next?: InheritedDerived;
}

@baker.Recipe
class InheritedDerived extends InheritedBase {
  @Field({ optional: true })
  extra?: string;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('circular reference detection', () => {
  it('normal tree structure → passes', async () => {
    const result = (await baker.deserialize<TreeNode>(TreeNode, {
      value: 'root',
      child: { value: 'leaf' },
    })) as TreeNode;
    expect(result.value).toBe('root');
    expect(result.child).toBeInstanceOf(TreeNode);
    expect(result.child!.value).toBe('leaf');
  });

  it('circular reference input → circular error', async () => {
    const circular: { value: string; child: { value: string; child?: unknown } } = { value: 'a', child: { value: 'b' } };
    circular.child.child = circular; // circular reference

    const result = await baker.deserialize(TreeNode, circular);
    assertBakerIssueSet(result);
    const err = result.errors.find(e => e.code === 'circular');
    expect(err).toBeDefined();
  });

  it('cycle through an inherited @Type field → circular error (not stack overflow)', async () => {
    const circular: { value: string; extra: string; next?: unknown } = { value: 'a', extra: 'x' };
    circular.next = circular; // self-reference via the field inherited from InheritedBase

    const result = await baker.deserialize(InheritedDerived, circular);
    assertBakerIssueSet(result);
    const err = result.errors.find(e => e.code === 'circular');
    expect(err).toBeDefined();
  });

  it('auto mode (default) → auto-detects circular structure DTO', async () => {
    const result = (await baker.deserialize<TreeNode>(TreeNode, {
      value: 'root',
      child: { value: 'child', child: { value: 'grandchild' } },
    })) as TreeNode;
    expect(result.child!.child!.value).toBe('grandchild');
  });
});
