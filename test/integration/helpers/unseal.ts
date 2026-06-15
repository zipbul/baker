// Test-only: forget the classes tracked by `sealClass` between tests. Executors live in each
// Baker's own (discarded) map and RAW metadata on the class is never mutated by sealing, so there is
// no per-class state to roll back — re-sealing a class through a fresh Baker just works.
import { trackedSealed } from './seal';

export function unseal(): void {
  trackedSealed.clear();
}
