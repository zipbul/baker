import type { SealOptions } from './interfaces';

import { BakerError } from './errors';

// ─────────────────────────────────────────────────────────────────────────────
// BakerConfig — per-Baker configuration (passed to `new Baker(config)`)
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

/**
 * Validate a BakerConfig and map it to the internal SealOptions. Used by `new Baker(config)`.
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

export { normalizeConfig };
export type { BakerConfig };
