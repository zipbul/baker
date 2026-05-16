import { _sealedClasses } from '../../../src/seal/seal';
import { RAW, SEALED } from '../../../src/symbols';
import { globalRegistry } from '../../../src/registry';
import { _resetForTesting } from '../../../src/seal/seal';
import { _resetConfigForTesting } from '../../../src/configure';
import type { SealedExecutors } from '../../../src/types';

/**
 * Testing only: resets seal state + global configuration.
 * Post W13 auto-seal removal — tests must call `seal()` explicitly after `unseal()`
 * and after any `configure(...)` change.
 */
export function unseal(): void {
  for (const Class of _sealedClasses) {
    const sealed = (Class as any)[SEALED] as SealedExecutors<unknown> | undefined;
    if (sealed?._merged) {
      (Class as any)[RAW] = sealed._merged;
    }
    delete (Class as any)[SEALED];
    globalRegistry.add(Class);
  }
  _resetForTesting();
  _resetConfigForTesting();
}

/**
 * Testing only: removes every class currently in `globalRegistry`.
 * Use in `afterEach` of test files that exercise seal failure paths
 * (e.g. conflicting requiresType, throwing @Type thunk) — failed seal
 * leaves the class in `globalRegistry` with no `SEALED`, so the next
 * test's `beforeEach(seal())` would re-attempt and fail again.
 *
 * Pair with `unseal()`:
 *   afterEach(() => { purgePoisonClasses(); unseal(); });
 */
export function purgePoisonClasses(): void {
  for (const cls of [...globalRegistry]) globalRegistry.delete(cls);
}
