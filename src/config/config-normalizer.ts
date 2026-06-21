import type { SealOptions } from '../seal';
import type { BakerConfig } from './interfaces';

import { BakerError } from '../common';
import { BAKER_CONFIG_KEYS } from './constants';

/**
 * Validates a {@link BakerConfig} and maps it to the internal {@link SealOptions}. Holds the set of
 * valid config keys as an injected collaborator (default: {@link BAKER_CONFIG_KEYS}), so the unknown-key
 * rejection reads from instance state. Used by `new Baker(config)` via the `configNormalizer` singleton.
 */
export class ConfigNormalizer {
  readonly #validKeys: ReadonlySet<keyof BakerConfig>;

  constructor(validKeys: ReadonlySet<keyof BakerConfig> = BAKER_CONFIG_KEYS) {
    this.#validKeys = validKeys;
  }

  normalize(config: BakerConfig): SealOptions {
    if (config === null || typeof config !== 'object' || Array.isArray(config)) {
      throw new BakerError(
        `[baker] config requires a plain object. Received: ${config === null ? 'null' : Array.isArray(config) ? 'array' : typeof config}.`,
      );
    }
    for (const key of Object.keys(config)) {
      if (!this.#validKeys.has(key as keyof BakerConfig)) {
        throw new BakerError(`[baker] unknown key '${key}'. ` + `Valid keys: ${[...this.#validKeys].join(', ')}.`);
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
}

export const configNormalizer = new ConfigNormalizer();
