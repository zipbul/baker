import { _sealedClasses } from '../../../src/seal/seal';
import { RAW, SEALED } from '../../../src/symbols';
import { globalRegistry } from '../../../src/registry';
import { _resetForTesting } from '../../../src/seal/seal';
import { _resetConfigForTesting } from '../../../src/configure';
import type { SealedExecutors } from '../../../src/types';

/**
 * Testing only: resets seal state + global configuration.
 * - Restores RAW from _merged cache + re-registers in globalRegistry
 * - Removes Class[SEALED] from all classes
 * - Resets _sealed flag to false
 * - Resets configure() global options
 * - Do NOT use in production
 */
export function unseal(): void {
  for (const Class of _sealedClasses) {
    const sealed = (Class as any)[SEALED] as SealedExecutors<unknown> | undefined;
    // Restore RAW from _merged (to allow re-seal) — overwrites frozen RAW too
    if (sealed?._merged) {
      (Class as any)[RAW] = sealed._merged;
    }
    delete (Class as any)[SEALED];
    globalRegistry.add(Class);
  }
  _resetForTesting();
  _resetConfigForTesting();
}
