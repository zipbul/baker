// Test-only: reset seal state between tests. RAW metadata on the class is never mutated by sealing,
// so there is no per-class RAW to roll back — but the (class,config) cache must be reset as a WHOLE
// (not per-class), because a cached root and its nested DTOs are compiled together and must be
// invalidated together; clearing only some would leave a root referencing a dropped nested. Dropping
// the whole cache means a later re-seal of any class recompiles its full graph consistently.
import { clearAllCached } from '../../../src/seal/seal';
import { trackedSealed } from './seal';

export function unseal(): void {
  clearAllCached();
  trackedSealed.clear();
}
