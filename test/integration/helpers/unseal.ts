import type { SealedExecutors } from '../../../src/types';

import { resetConfigForTesting } from '../../../src/configure';
import { globalRegistry } from '../../../src/registry';
import { resetForTesting, sealedClasses } from '../../../src/seal/seal';
import { getSealed, deleteSealed, setRaw } from '../../../src/meta-access';

/**
 * Testing only: resets seal state + global configuration.
 * Post W13 auto-seal removal — tests must call `seal()` explicitly after `unseal()`
 * and after any `configure(...)` change.
 */
export function unseal(): void {
  for (const Class of sealedClasses) {
    const sealed = getSealed(Class) as SealedExecutors<unknown> | undefined;
    if (sealed?.merged) {
      setRaw(Class, sealed.merged);
    }
    deleteSealed(Class);
    globalRegistry.add(Class);
  }
  resetForTesting();
  resetConfigForTesting();
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
  const cls: Function[] = [];
  for (const c of globalRegistry) {cls.push(c);}
  for (const c of cls) {globalRegistry.delete(c);}
}
