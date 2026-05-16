/**
 * @internal — shared seal state, extracted so `configure.ts` can read `_isSealed()`
 * without importing `seal.ts` (which would create a cycle: seal → configure → seal).
 */

let _sealed = false;

/** List of sealed classes — used by unseal to remove SEALED */
export const _sealedClasses = new Set<Function>();

export function _isSealed(): boolean {
  return _sealed;
}

export function _markSealed(): void {
  _sealed = true;
}

/** @internal — used by unseal() in test helpers */
export function _resetForTesting(): void {
  _sealed = false;
  _sealedClasses.clear();
}
