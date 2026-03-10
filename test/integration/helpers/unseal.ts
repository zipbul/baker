import { _sealedClasses } from '../../../src/seal/seal';
import { RAW, SEALED } from '../../../src/symbols';
import { globalRegistry } from '../../../src/registry';
import { _resetForTesting } from '../../../src/seal/seal';
import { _resetConfigForTesting } from '../../../src/configure';
import type { SealedExecutors } from '../../../src/types';

/**
 * 테스트 전용: 봉인 상태 + 글로벌 설정을 초기화한다.
 * - _merged 캐시에서 RAW 복원 + globalRegistry 재등록
 * - 모든 Class[SEALED] 제거
 * - _sealed 플래그 false로 리셋
 * - configure() 글로벌 옵션 리셋
 * - 프로덕션에서 사용 금지
 */
export function unseal(): void {
  for (const Class of _sealedClasses) {
    const sealed = (Class as any)[SEALED] as SealedExecutors<unknown> | undefined;
    // _merged에서 RAW 복원 (re-seal 가능하게)
    if (sealed?._merged && !Object.prototype.hasOwnProperty.call(Class, RAW)) {
      (Class as any)[RAW] = sealed._merged;
    }
    delete (Class as any)[SEALED];
    globalRegistry.add(Class);
  }
  _resetForTesting();
  _resetConfigForTesting();
}
