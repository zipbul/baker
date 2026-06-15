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
class TreeNode {
  @Field(isString)
  value!: string;

  @Field({ optional: true, type: () => TreeNode })
  child?: TreeNode;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('circular reference detection', () => {
  it('normal tree structure → passes', async () => {
    const result = (await deserialize<TreeNode>(TreeNode, {
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

    const result = await deserialize(TreeNode, circular);
    assertBakerIssueSet(result);
    const err = result.errors.find(e => e.code === 'circular');
    expect(err).toBeDefined();
  });

  it('auto mode (default) → auto-detects circular structure DTO', async () => {
    const result = (await deserialize<TreeNode>(TreeNode, {
      value: 'root',
      child: { value: 'child', child: { value: 'grandchild' } },
    })) as TreeNode;
    expect(result.child!.child!.value).toBe('grandchild');
  });
});
