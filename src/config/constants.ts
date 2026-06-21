import type { BakerConfig } from './interfaces';

/**
 * The valid {@link BakerConfig} keys. Shared single source: the ConfigNormalizer rejects unknown keys
 * with it, and the per-call options guard (runtime) rejects a seal-time config key passed at call time.
 */
export const BAKER_CONFIG_KEYS = new Set<keyof BakerConfig>([
  'autoConvert',
  'allowClassDefaults',
  'stopAtFirstError',
  'forbidUnknown',
  'debug',
]);
