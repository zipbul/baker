// Test-only: forget the classes tracked by `sealClass` between tests. RAW metadata on the class is
// never mutated by sealing, so there is no per-class RAW to roll back — but the (class,config) cache
// would otherwise make a re-seal of the SAME class object hit the cache instead of recompiling, so we
// drop those classes' cache entries too. Re-sealing a tracked class through a fresh Baker then truly
// recompiles.
import { clearCached } from '../../../src/seal/seal';
import { trackedSealed } from './seal';

export function unseal(): void {
  for (const cls of trackedSealed) {
    clearCached(cls);
  }
  trackedSealed.clear();
}
