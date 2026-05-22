// Test-only: seal a single class in isolation. Production code uses argless `seal()` only;
// `seal(Class)` is not part of the public API. Tests use this to seal one DTO without sealing
// the whole registry — needed for targeted error-path assertions and per-test isolation.
import { __testing__ } from '../../../src/seal/seal';

export function sealClass(cls: Function): void {
  __testing__.sealClass(cls);
}
