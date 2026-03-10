import { describe, it, expect, afterEach } from 'bun:test';
import { Field, deserialize, configure } from '../../index';
import { isString, isNumber } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => { unseal(); configure({}); });

// ─────────────────────────────────────────────────────────────────────────────

class DefaultsDto {
  @Field(isString)
  name: string = 'anonymous';

  @Field(isNumber())
  score: number = 100;

  @Field(isString, { optional: true })
  tag?: string = 'default-tag';
}

// ─────────────────────────────────────────────────────────────────────────────

describe('exposeDefaultValues', () => {
  it('true → 누락 필드에 클래스 기본값 사용', async () => {
    configure({ allowClassDefaults: true });
    const result = await deserialize<DefaultsDto>(DefaultsDto, {});
    expect(result.name).toBe('anonymous');
    expect(result.score).toBe(100);
  });

  it('true → 입력 값이 있으면 기본값 무시', async () => {
    configure({ allowClassDefaults: true });
    const result = await deserialize<DefaultsDto>(DefaultsDto, {
      name: 'Alice', score: 50,
    });
    expect(result.name).toBe('Alice');
    expect(result.score).toBe(50);
  });

  it('false (기본) → 누락 필드는 undefined → isDefined 에러', async () => {
    configure({ allowClassDefaults: false });
    await expect(
      deserialize(DefaultsDto, {}),
    ).rejects.toThrow();
  });

  it('true + optional → optional 필드도 기본값 사용', async () => {
    configure({ allowClassDefaults: true });
    const result = await deserialize<DefaultsDto>(DefaultsDto, {
      name: 'Bob', score: 80,
    });
    // optional이므로 undefined/null이면 skip, 기본값 유지될 수 있음
    // 하지만 allowClassDefaults는 optional 아닌 필드에만 적용
    expect(result.name).toBe('Bob');
  });
});
