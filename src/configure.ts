import type { SealOptions } from './interfaces';
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
  /**
   * @deprecated Renamed to `forbidUnknown`. This option actually raises an error
   * for unknown fields rather than silently removing them. Use `forbidUnknown` instead.
   * If `forbidUnknown` is specified, `stripUnknown` is ignored.
   */
  stripUnknown?: boolean;
  /** Include field exclusion reasons as comments in generated code. @default false */
  debug?: boolean;
}

let _globalOptions: SealOptions = {};

export interface ConfigureResult {
  warnings: string[];
}

/**
 * Baker global configuration. Call before the first auto-seal.
 * If not called, defaults are applied.
 *
 * @returns `{ warnings }` — contains warning messages if called after seal.
 */
export function configure(config: BakerConfig): ConfigureResult {
  const warnings: string[] = [];
  if (_isSealed()) {
    const msg = '[baker] configure() called after auto-seal. Already-sealed classes are not affected. Call configure() before the first deserialize/serialize.';
    warnings.push(msg);
    console.warn(msg);
  }
  _globalOptions = {
    enableImplicitConversion: config.autoConvert ?? false,
    exposeDefaultValues: config.allowClassDefaults ?? false,
    stopAtFirstError: config.stopAtFirstError ?? false,
    whitelist: config.forbidUnknown ?? config.stripUnknown ?? false,
    debug: config.debug ?? false,
  };
  return { warnings };
}

/** @internal — used by seal */
export function _getGlobalOptions(): SealOptions {
  return _globalOptions;
}

/** @internal — reset to defaults on unseal */
export function _resetConfigForTesting(): void {
  _globalOptions = {};
}
