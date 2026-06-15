// Test-only: roll back classes sealed via `sealClass` (restore RAW metadata, drop the executor)
// so a later test can re-seal them. No global registry — operates only on tracked classes.
import type { SealedExecutors } from '../../../src/types';

import { deleteSealed, getSealed, setRaw } from '../../../src/meta-access';
import { trackedSealed } from './seal';

export function unseal(): void {
  for (const Class of trackedSealed) {
    const sealed = getSealed(Class) as SealedExecutors<unknown> | undefined;
    if (sealed?.merged) {
      setRaw(Class, sealed.merged);
    }
    deleteSealed(Class);
  }
  trackedSealed.clear();
}

/** @deprecated No global registry to purge under the Baker model — kept as a no-op for callers. */
export function purgePoisonClasses(): void {
  /* no-op */
}
