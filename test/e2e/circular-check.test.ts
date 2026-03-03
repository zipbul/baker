import { describe, it, expect, afterEach } from 'bun:test';
import { seal, deserialize, BakerValidationError, IsString, IsOptional, Nested } from '../../index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class TreeNode {
  @IsString()
  value!: string;

  @IsOptional()
  @Nested(() => TreeNode)
  child?: TreeNode;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('enableCircularCheck', () => {
  it('정상 트리 구조 → 통과', async () => {
    seal({ enableCircularCheck: true });
    const result = await deserialize<TreeNode>(TreeNode, {
      value: 'root',
      child: { value: 'leaf' },
    });
    expect(result.value).toBe('root');
    expect(result.child).toBeInstanceOf(TreeNode);
    expect(result.child!.value).toBe('leaf');
  });

  it('순환 참조 입력 → circular 에러', async () => {
    seal({ enableCircularCheck: true });
    const circular: any = { value: 'a', child: { value: 'b' } };
    circular.child.child = circular; // 순환 참조

    try {
      await deserialize(TreeNode, circular);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BakerValidationError);
      const err = (e as BakerValidationError).errors.find(e => e.code === 'circular');
      expect(err).toBeDefined();
    }
  });

  it('auto 모드 (기본) → 순환 구조 DTO 자동 감지', async () => {
    seal({ enableCircularCheck: 'auto' });
    const result = await deserialize<TreeNode>(TreeNode, {
      value: 'root',
      child: { value: 'child', child: { value: 'grandchild' } },
    });
    expect(result.child!.child!.value).toBe('grandchild');
  });
});
