import { isErr } from '@zipbul/result';
import { BakerValidationError } from '../errors';
import { _ensureSealed } from '../seal/seal';
import type { BakerError } from '../errors';
import type { RuntimeOptions } from '../interfaces';

// ─────────────────────────────────────────────────────────────────────────────
// deserialize — Public API (throw 패턴) (§5.1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * input → Class 인스턴스 변환 + 검증.
 * - 첫 호출 시 auto-seal (globalRegistry 전체 배치)
 * - 성공: Promise<T> 반환
 * - 검증 실패: BakerValidationError throw
 * - 데코레이터 없는 클래스: SealError throw
 */
export async function deserialize<T>(
  Class: new (...args: any[]) => T,
  input: unknown,
  options?: RuntimeOptions,
): Promise<T> {
  const sealed = _ensureSealed(Class);
  const result = await sealed._deserialize(input, options);
  if (isErr(result)) {
    throw new BakerValidationError(result.data as BakerError[], Class.name);
  }
  return result as T;
}
