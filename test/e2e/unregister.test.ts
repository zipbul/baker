import { describe, it, expect, afterEach } from 'bun:test';
import { seal, deserialize, unregister, SealError, IsString } from '../../index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

describe('unregister()', () => {
  it('등록 해제 후 seal → 해당 클래스 봉인 안 됨', async () => {
    class TempDto {
      @IsString()
      name!: string;
    }

    // 데코레이터 적용 시 자동 등록됨
    // seal 전에 해제
    const removed = unregister(TempDto);
    expect(removed).toBe(true);

    seal();

    // 봉인 안 되었으므로 deserialize 시 SealError
    await expect(
      deserialize(TempDto, { name: 'Alice' }),
    ).rejects.toThrow(SealError);
  });

  it('미등록 클래스 해제 → false 반환', () => {
    class NeverRegistered {}
    expect(unregister(NeverRegistered)).toBe(false);
  });
});
