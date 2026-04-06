import type { SealOptions } from './interfaces';
import { SealError } from './errors';
import { _isSealed } from './seal/seal';

// ─────────────────────────────────────────────────────────────────────────────
// BakerConfig — Global configuration (call before auto-seal)
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

let _globalOptions: SealOptions = {};

/**
 * Baker global configuration. Call before the first auto-seal.
 * If not called, defaults are applied.
 */
export function configure(config: BakerConfig): void {
  if (_isSealed()) {
    throw new SealError(
      '[baker] configure() called after auto-seal. Already-sealed classes are not affected. Call configure() before the first deserialize/serialize/validate.',
    );
  }
  _globalOptions = {
    enableImplicitConversion: config.autoConvert ?? false,
    exposeDefaultValues: config.allowClassDefaults ?? false,
    stopAtFirstError: config.stopAtFirstError ?? false,
    whitelist: config.forbidUnknown ?? false,
    debug: config.debug ?? false,
  };
}

/** @internal — used by seal */
export function _getGlobalOptions(): SealOptions {
  return _globalOptions;
}

/** @internal — reset to defaults on unseal */
export function _resetConfigForTesting(): void {
  _globalOptions = {};
}
