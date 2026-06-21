import type { SealOptions, SealedExecutors } from './interfaces';

import { SEAL_OPTION_KEYS } from './constants';

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
 *
 * The cache owns its WeakMap as a private field (no module-level mutable state) and is exposed as a
 * single process-global instance, `compileCache` — the single source of truth for compiled executors.
 */
class CompileCache {
  #cache: WeakMap<Function, Map<string, SealedExecutors<unknown>>>;

  constructor() {
    this.#cache = new WeakMap();
  }

  /**
   * Canonical fingerprint of a SealOptions — the seal-affecting booleans in fixed order. `{}` and a
   * fully-defaulted object both map to "00000", so `new Baker()` and `new Baker({})` share a cache key.
   */
  fingerprint(o: SealOptions): string {
    let fp = '';
    for (const key of SEAL_OPTION_KEYS) {
      fp += o[key] ? '1' : '0';
    }
    return fp;
  }

  get(cls: Function, fp: string): SealedExecutors<unknown> | undefined {
    return this.#cache.get(cls)?.get(fp);
  }

  set(cls: Function, fp: string, exec: SealedExecutors<unknown>): void {
    let m = this.#cache.get(cls);
    if (m === undefined) {
      m = new Map();
      this.#cache.set(cls, m);
    }
    m.set(fp, exec);
  }

  /** Test-only: drop a single class's cached executors so a re-seal recompiles it. */
  clear(cls: Function): void {
    this.#cache.delete(cls);
  }

  /**
   * Test-only: drop the ENTIRE cache. Used by `unseal()` so a test that re-seals classes starts from a
   * clean slate — a whole-cache reset (vs per-class) is the only way to avoid the partial-clear state
   * where a cached root still references a nested whose entry was dropped (a root + its nested are
   * always compiled together, so they must be invalidated together).
   */
  clearAll(): void {
    this.#cache = new WeakMap();
  }
}

export const compileCache = new CompileCache();
