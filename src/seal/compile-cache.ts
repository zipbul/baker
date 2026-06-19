import type { SealOptions } from './interfaces';
import type { SealedExecutors } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// (class, config) executor cache — content-addressed sharing across bakers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A class's generated executor is a pure function of (its RAW metadata, the seal config). So two
 * bakers with the SAME config compile byte-identical executors — memoize globally by
 * `(class, configFingerprint)` so they share one executor (compiled once) instead of N copies, while
 * different-config bakers stay isolated (distinct fingerprint → distinct entry). Behaviour is
 * unchanged either way: executors are pure (no per-call mutable state), so sharing is invisible.
 *
 * `WeakMap<class>` so an entry is reclaimed when its class is GC'd. The inner `Map` retains one
 * executor per (class, config) for the class's lifetime — bounded for a fixed DTO/config set (the
 * intended "seal once at startup" usage); a program that dynamically generates classes/configs would
 * grow it without eviction.
 */
let compileCache = new WeakMap<Function, Map<string, SealedExecutors<unknown>>>();

/** Canonical fingerprint of a SealOptions — the 5 booleans in fixed order. `{}` and a fully-defaulted
 * object both map to "00000", so `new Baker()` and `new Baker({})` share a cache key. */
export function configFingerprint(o: SealOptions): string {
  return (
    (o.enableImplicitConversion ? '1' : '0') +
    (o.exposeDefaultValues ? '1' : '0') +
    (o.stopAtFirstError ? '1' : '0') +
    (o.whitelist ? '1' : '0') +
    (o.debug ? '1' : '0')
  );
}

export function getCached(cls: Function, fp: string): SealedExecutors<unknown> | undefined {
  return compileCache.get(cls)?.get(fp);
}

export function setCached(cls: Function, fp: string, exec: SealedExecutors<unknown>): void {
  let m = compileCache.get(cls);
  if (m === undefined) {
    m = new Map();
    compileCache.set(cls, m);
  }
  m.set(fp, exec);
}

/** Test-only: drop a single class's cached executors so a re-seal recompiles it. */
export function clearCached(cls: Function): void {
  compileCache.delete(cls);
}

/**
 * Test-only: drop the ENTIRE cache. Used by `unseal()` so a test that re-seals classes starts from a
 * clean slate — a whole-cache reset (vs per-class) is the only way to avoid the partial-clear state
 * where a cached root still references a nested whose entry was dropped (a root + its nested are always
 * compiled together, so they must be invalidated together).
 */
export function clearAllCached(): void {
  compileCache = new WeakMap();
}
