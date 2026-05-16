import type { SealOptions } from './interfaces';

import { SealError } from './errors';
import { isSealed } from './seal/seal-state';

// ─────────────────────────────────────────────────────────────────────────────
// BakerConfig — Global configuration (call before seal())
// ─────────────────────────────────────────────────────────────────────────────

export interface BakerConfig {
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

let globalOptionsState: SealOptions = {};

/**
 * Baker global configuration. Call before `seal()`.
 * If not called, defaults are applied.
 */
export function configure(config: BakerConfig): void {
  if (isSealed()) {
    throw new SealError(
      '[baker] configure() called after seal(). Already-sealed classes are not affected. Call configure() before seal().',
    );
  }
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    throw new SealError(
      `[baker] configure() requires a plain object. Received: ${config === null ? 'null' : Array.isArray(config) ? 'array' : typeof config}.`,
    );
  }
  for (const key of Object.keys(config)) {
    if (!BAKER_CONFIG_KEYS.has(key as keyof BakerConfig)) {
      throw new SealError(`[baker] configure(): unknown key '${key}'. ` + `Valid keys: ${[...BAKER_CONFIG_KEYS].join(', ')}.`);
    }
  }
  globalOptionsState = {
    enableImplicitConversion: config.autoConvert ?? false,
    exposeDefaultValues: config.allowClassDefaults ?? false,
    stopAtFirstError: config.stopAtFirstError ?? false,
    whitelist: config.forbidUnknown ?? false,
    debug: config.debug ?? false,
  };
}

/** @internal — used by seal. Returns a frozen snapshot so internal mutations are visible only via configure(). */
export function getGlobalOptions(): SealOptions {
  return globalOptionsState;
}

/** @internal — reset to defaults on unseal */
export function resetConfigForTesting(): void {
  globalOptionsState = {};
}
