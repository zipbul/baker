// Test-only: seal a single class in isolation. Uses the internal single-class seal so a test can
// seal one DTO (often defined inside the test) without a shared registry.
import { __testing__ } from '../../../src/seal/seal';

export function sealClass(cls: Function): void {
  __testing__.sealClass(cls);
}
