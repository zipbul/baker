import type { RuntimeOptions } from '../common';

import { BakerError } from '../common';

const CALL_OPTION_KEYS = new Set<string>(['groups']);
const SEAL_TIME_KEYS = new Set<string>([
  // BakerConfig (public, configure-time)
  'autoConvert',
  'allowClassDefaults',
  'stopAtFirstError',
  'forbidUnknown',
  'debug',
  // SealOptions (internal, legacy aliases — same set covered by public names)
  'enableImplicitConversion',
  'exposeDefaultValues',
  'whitelist',
]);

/**
 * @internal — validate per-call options object at public-API entry.
 * `groups` is the only valid per-call key; everything else is rejected:
 *   - seal-time keys (BakerConfig / SealOptions) → "move to new Baker({...})"
 *   - any other key → "unknown call option"
 */
export function checkCallOptions(opts: unknown): RuntimeOptions | undefined {
  if (opts === undefined || opts === null) {
    return undefined;
  }
  if (typeof opts !== 'object' || Array.isArray(opts)) {
    throw new BakerError(`Call options must be a plain object. Received: ${Array.isArray(opts) ? 'array' : typeof opts}.`);
  }
  // Strict same-realm plain-object check.
  // Accept: `{}` (proto === Object.prototype) and `Object.create(null)` (proto === null).
  // Reject: every other prototype, including class instances whose `constructor.name` is
  // renamed to 'Object' (trojan), built-ins (Date/Map/Set), cross-realm objects.
  // Cross-realm consumers can normalize with `Object.assign({}, opts)` before calling.
  const proto = Object.getPrototypeOf(opts);
  if (proto !== null && proto !== Object.prototype) {
    const ctorName = (opts as { constructor?: { name?: string } }).constructor?.name ?? 'unknown';
    throw new BakerError(`Call options must be a plain object literal. Received instance of ${ctorName}.`);
  }
  for (const key of Object.keys(opts)) {
    if (CALL_OPTION_KEYS.has(key)) {
      continue;
    }
    if (SEAL_TIME_KEYS.has(key)) {
      throw new BakerError(
        `Option '${key}' is a seal-time setting and cannot be passed per-call. ` +
          `Move it to new Baker({ ${key}: ... }) at app startup. ` +
          `Per-call options: ${[...CALL_OPTION_KEYS].join(', ')}.`,
      );
    }
    throw new BakerError(
      `Unknown per-call option '${key}'. Valid per-call options: ${[...CALL_OPTION_KEYS].join(', ')}. ` +
        `Seal-time options go to new Baker({...}).`,
    );
  }
  return opts as RuntimeOptions;
}
