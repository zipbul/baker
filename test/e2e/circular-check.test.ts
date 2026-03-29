import { describe, it, expect, afterEach } from 'bun:test';
import { Field, deserialize, isBakerError } from '../../index';
import { isString } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class TreeNode {
  @Field(isString)
  value!: string;

  @Field({ optional: true, type: () => TreeNode })
  child?: TreeNode;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('circular reference detection', () => {
  it('normal tree structure → passes', async () => {
    const result = await deserialize<TreeNode>(TreeNode, {
      value: 'root',
      child: { value: 'leaf' },
    }) as TreeNode;
    expect(result.value).toBe('root');
    expect(result.child).toBeInstanceOf(TreeNode);
    expect(result.child!.value).toBe('leaf');
  });

  it('circular reference input → circular error', async () => {
    const circular: any = { value: 'a', child: { value: 'b' } };
    circular.child.child = circular; // circular reference

    const result = await deserialize(TreeNode, circular);
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      const err = result.errors.find(e => e.code === 'circular');
      expect(err).toBeDefined();
    }
  });

  it('auto mode (default) → auto-detects circular structure DTO', async () => {
    const result = await deserialize<TreeNode>(TreeNode, {
      value: 'root',
      child: { value: 'child', child: { value: 'grandchild' } },
    }) as TreeNode;
    expect(result.child!.child!.value).toBe('grandchild');
  });
});
