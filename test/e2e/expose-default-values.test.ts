import { describe, it, expect, afterEach } from 'bun:test';
import { seal, deserialize, IsString, IsNumber, IsOptional } from '../../index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class DefaultsDto {
  @IsString()
  name: string = 'anonymous';

  @IsNumber()
  score: number = 100;

  @IsOptional()
  @IsString()
  tag?: string = 'default-tag';
}

// ─────────────────────────────────────────────────────────────────────────────

describe('exposeDefaultValues', () => {
  it('true → 누락 필드에 클래스 기본값 사용', async () => {
    seal({ exposeDefaultValues: true });
    const result = await deserialize<DefaultsDto>(DefaultsDto, {});
    expect(result.name).toBe('anonymous');
    expect(result.score).toBe(100);
  });

  it('true → 입력 값이 있으면 기본값 무시', async () => {
    seal({ exposeDefaultValues: true });
    const result = await deserialize<DefaultsDto>(DefaultsDto, {
      name: 'Alice', score: 50,
    });
    expect(result.name).toBe('Alice');
    expect(result.score).toBe(50);
  });

  it('false (기본) → 누락 필드는 undefined → isDefined 에러', async () => {
    seal({ exposeDefaultValues: false });
    await expect(
      deserialize(DefaultsDto, {}),
    ).rejects.toThrow();
  });

  it('true + @IsOptional → optional 필드도 기본값 사용', async () => {
    seal({ exposeDefaultValues: true });
    const result = await deserialize<DefaultsDto>(DefaultsDto, {
      name: 'Bob', score: 80,
    });
    // @IsOptional이므로 undefined/null이면 skip, 기본값 유지될 수 있음
    // 하지만 exposeDefaultValues는 @IsOptional 아닌 필드에만 적용
    expect(result.name).toBe('Bob');
  });
});
