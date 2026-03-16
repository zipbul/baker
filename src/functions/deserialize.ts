import { isErr } from '@zipbul/result';
import { BakerValidationError } from '../errors';
import { _ensureSealed } from '../seal/seal';
import type { BakerError } from '../errors';
import type { RuntimeOptions } from '../interfaces';

// ─────────────────────────────────────────────────────────────────────────────
// deserialize — Public API (throw 패턴) (§5.1)
// ─────────────────────────────────────────────────────────────────────────────

function unwrapResult<T>(result: any, className: string): T {
  if (isErr(result)) {
    throw new BakerValidationError(result.data as BakerError[], className);
  }
  return result as T;
}

/**
 * input → Class 인스턴스 변환 + 검증.
 * - 첫 호출 시 auto-seal (globalRegistry 전체 배치)
 * - async transform/rule이 없는 DTO → `async function` 없이 실행, Promise.resolve로 반환
 * - 성공: Promise<T> 반환
 * - 검증 실패: BakerValidationError (rejected promise)
 * - 데코레이터 없는 클래스: SealError throw
 */
export function deserialize<T>(
  Class: new (...args: any[]) => T,
  input: unknown,
  options?: RuntimeOptions,
): Promise<T> {
  try {
    const sealed = _ensureSealed(Class);
    if (sealed._isAsync) {
      return (sealed._deserialize(input, options) as Promise<any>).then(
        (result: any) => unwrapResult<T>(result, Class.name),
      );
    }
    return Promise.resolve(unwrapResult<T>(sealed._deserialize(input, options), Class.name));
  } catch (e) {
    return Promise.reject(e);
  }
}
