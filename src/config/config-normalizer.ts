import type { SealOptions } from '../seal';
import type { BakerConfig } from './interfaces';

import { BakerError } from '../common';
import { BAKER_CONFIG_KEYS } from './constants';

/**
 * Validates a {@link BakerConfig} and maps it to the internal {@link SealOptions}. Used by
 * `new Baker(config)`. Stateless — a plain function (no instance/class needed).
 */
export function normalizeConfig(config: BakerConfig): SealOptions {
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
