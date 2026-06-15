import type { SealOptions } from './interfaces';

import { BakerError } from './errors';
import { isSealed } from './seal/seal-state';

// ─────────────────────────────────────────────────────────────────────────────
// BakerConfig — Global configuration (call before seal())
// ─────────────────────────────────────────────────────────────────────────────

interface BakerConfig {
  /** Automatic type conversion ("123" → 123). @default false */
  autoConvert?: boolean;
  /** Use class default values when key is missing from input. @default false */
  allowClassDefaults?: boolean;
  /** Stop at first error. @default false */
  stopAtFirstError?: boolean;
  /** Reject undeclared fields with an error. @default false */
  forbidUnknown?: boolean;
  /** Include field exclusion reasons as comments in generated code. @default false */
  debug?: boolean;
}

const BAKER_CONFIG_KEYS = new Set<keyof BakerConfig>([
  'autoConvert',
  'allowClassDefaults',
  'stopAtFirstError',
  'forbidUnknown',
  'debug',
]);

let globalOptionsState: SealOptions = Object.freeze({});

/**
 * Baker global configuration. Call before `seal()`.
 * If not called, defaults are applied.
 */
function configure(config: BakerConfig): void {
  if (isSealed()) {
    throw new BakerError(
      '[baker] configure() called after seal(). Already-sealed classes are not affected. Call configure() before seal().',
    );
  }
  globalOptionsState = normalizeConfig(config);
}

/**
 * Validate a BakerConfig and map it to the internal SealOptions. Shared by `configure()`
 * (default instance) and `createBaker()` (per-scope instances). Does NOT check seal state —
 * that gate is specific to the global `configure()`.
 */
function normalizeConfig(config: BakerConfig): SealOptions {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    throw new BakerError(
      `[baker] config requires a plain object. Received: ${config === null ? 'null' : Array.isArray(config) ? 'array' : typeof config}.`,
    );
  }
  for (const key of Object.keys(config)) {
    if (!BAKER_CONFIG_KEYS.has(key as keyof BakerConfig)) {
      throw new BakerError(`[baker] unknown key '${key}'. ` + `Valid keys: ${[...BAKER_CONFIG_KEYS].join(', ')}.`);
    }
  }
  return Object.freeze({
    enableImplicitConversion: config.autoConvert ?? false,
    exposeDefaultValues: config.allowClassDefaults ?? false,
    stopAtFirstError: config.stopAtFirstError ?? false,
    whitelist: config.forbidUnknown ?? false,
    debug: config.debug ?? false,
  });
}

/** @internal — used by seal. Returns the frozen global options; the only way to change them is configure(). */
function getGlobalOptions(): SealOptions {
  return globalOptionsState;
}

/** @internal — reset to defaults on unseal */
function resetConfigForTesting(): void {
  globalOptionsState = Object.freeze({});
}
export { configure, getGlobalOptions, resetConfigForTesting, normalizeConfig };
export type { BakerConfig };
