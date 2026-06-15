// Test-only: seal a single class in isolation via a fresh Baker and RETURN that baker, so the test
// can run executors through it (`b.deserialize(...)`). Lets a test seal one DTO (often defined in the
// test) without a shared registry.
import { Baker } from '../../../index';

/** Classes sealed via `sealClass`, so `unseal()` can roll them back between tests. */
export const trackedSealed = new Set<Function>();

export function sealClass(cls: Function): Baker {
  const baker = new Baker();
  (baker.Recipe as (value: Function) => void)(cls);
  baker.seal();
  trackedSealed.add(cls);
  return baker;
}
