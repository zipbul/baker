/**
 * @internal — shared seal state, extracted so `configure.ts` can read `isSealed()`
 * without importing `seal.ts` (which would create a cycle: seal → configure → seal).
 */

let _sealed = false;

/** List of sealed classes — used by unseal to remove SEALED */
export const sealedClasses = new Set<Function>();

export function isSealed(): boolean {
  return _sealed;
}

export function markSealed(): void {
  _sealed = true;
}

/** @internal — used by unseal() in test helpers */
export function resetForTesting(): void {
  _sealed = false;
  sealedClasses.clear();
}
