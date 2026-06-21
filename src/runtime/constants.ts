import { BAKER_CONFIG_KEYS } from '../config';
import { SEAL_OPTION_KEYS } from '../seal';

/** The only valid per-call option keys — single source for both validation and error messages. */
export const CALL_OPTION_KEYS = new Set<string>(['groups']);

// Seal-time keys rejected per-call: the public BakerConfig names (single source: BAKER_CONFIG_KEYS)
// plus the internal SealOptions names they normalize to (single source: SEAL_OPTION_KEYS). Both are
// derived from their key sets, so a renamed/added option can never silently fall through to the
// generic "unknown option" message.
export const SEAL_TIME_KEYS = new Set<string>([...BAKER_CONFIG_KEYS, ...SEAL_OPTION_KEYS]);
