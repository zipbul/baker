import { _ensureSealed } from '../seal/seal';
import type { RuntimeOptions } from '../interfaces';

// ─────────────────────────────────────────────────────────────────────────────
// serialize — Public API (§5.2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Class 인스턴스 → plain 객체 변환.
 * - 첫 호출 시 auto-seal (globalRegistry 전체 배치)
 * - async transform이 없는 DTO → `async function` 없이 실행, Promise.resolve로 반환
 * - 무검증 전제 — 항상 Record<string, unknown> 반환
 * - 데코레이터 없는 클래스: SealError throw
 */
export function serialize<T>(
  instance: T,
  options?: RuntimeOptions,
): Promise<Record<string, unknown>> {
  try {
    const Class = (instance as any).constructor as Function;
    const sealed = _ensureSealed(Class);
    if (sealed._isSerializeAsync) {
      return sealed._serialize(instance, options) as Promise<Record<string, unknown>>;
    }
    return Promise.resolve(sealed._serialize(instance, options) as Record<string, unknown>);
  } catch (e) {
    return Promise.reject(e);
  }
}
