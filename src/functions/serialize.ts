import { SEALED } from '../symbols';
import { SealError } from '../errors';
import { _autoSeal, _sealOnDemand } from '../seal/seal';
import type { RuntimeOptions } from '../interfaces';

// ─────────────────────────────────────────────────────────────────────────────
// serialize — Public API (§5.2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Class 인스턴스 → plain 객체 변환.
 * - 첫 호출 시 auto-seal (globalRegistry 전체 배치)
 * - 무검증 전제 — 항상 Record<string, unknown> 반환 (또는 Promise)
 * - 데코레이터 없는 클래스: SealError throw
 */
export async function serialize<T>(
  instance: T,
  options?: RuntimeOptions,
): Promise<Record<string, unknown>> {
  const Class = (instance as any).constructor as Function;
  let sealed = (Class as any)[SEALED];
  if (!sealed) {
    _autoSeal();
    sealed = (Class as any)[SEALED];
    if (!sealed) {
      _sealOnDemand(Class);
      sealed = (Class as any)[SEALED];
      if (!sealed) {
        throw new SealError(`${Class.name} has no @Field decorators`);
      }
    }
  }

  return await sealed._serialize(instance, options) as Record<string, unknown>;
}
