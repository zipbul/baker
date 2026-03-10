import { isErr } from '@zipbul/result';
import { SEALED } from '../symbols';
import { SealError, BakerValidationError } from '../errors';
import { _autoSeal, _sealOnDemand } from '../seal/seal';
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
  let sealed = (Class as any)[SEALED];
  if (!sealed) {
    // 배치 auto-seal
    _autoSeal();
    sealed = (Class as any)[SEALED];
    if (!sealed) {
      // 동적 import — auto-seal 이후 등록된 클래스
      _sealOnDemand(Class);
      sealed = (Class as any)[SEALED];
      if (!sealed) {
        throw new SealError(`${Class.name} has no @Field decorators`);
      }
    }
  }

  const result = await sealed._deserialize(input, options);
  if (isErr(result)) {
    throw new BakerValidationError(result.data as BakerError[], Class.name);
  }
  return result as T;
}
