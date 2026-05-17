/**
 * @internal — shared seal state, extracted so `configure.ts` can read `isSealed()`
 * without importing `seal.ts` (which would create a cycle: seal → configure → seal).
 */

let sealed = false;

/** List of sealed classes — used by unseal to remove SEALED */
export const sealedClasses = new Set<Function>();

export function isSealed(): boolean {
  return sealed;
}

export function markSealed(): void {
  sealed = true;
}

/** @internal — used by unseal() in test helpers */
export function resetForTesting(): void {
  sealed = false;
  sealedClasses.clear();
}
