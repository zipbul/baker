import { describe, it, expect, afterEach } from 'bun:test';
import { seal, deserialize, serialize, SealError, IsString } from '../../index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class SealTestDto {
  @IsString()
  name!: string;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('SealError', () => {
  it('seal() 2회 호출 → SealError', () => {
    seal();
    expect(() => seal()).toThrow(SealError);
  });

  it('미봉인 클래스 deserialize → SealError', async () => {
    // seal() 미호출
    await expect(
      deserialize(SealTestDto, { name: 'Alice' }),
    ).rejects.toThrow(SealError);
  });

  it('미봉인 클래스 serialize → SealError', async () => {
    const dto = Object.assign(new SealTestDto(), { name: 'Bob' });
    await expect(serialize(dto)).rejects.toThrow(SealError);
  });

  it('unseal → 재봉인 가능', () => {
    seal();
    unseal();
    expect(() => seal()).not.toThrow();
  });
});

describe('seal debug 옵션', () => {
  it('debug: true → _source 저장', () => {
    seal({ debug: true });
    const sealed = (SealTestDto as any)[Symbol.for('baker:sealed')];
    expect(sealed._source).toBeDefined();
    expect(typeof sealed._source.deserialize).toBe('string');
    expect(typeof sealed._source.serialize).toBe('string');
    expect(sealed._source.deserialize.length).toBeGreaterThan(0);
  });
});
