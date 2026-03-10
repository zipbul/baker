import type { SealOptions } from './interfaces';
import { _isSealed } from './seal/seal';

// ─────────────────────────────────────────────────────────────────────────────
// BakerConfig — 글로벌 설정 (auto-seal 전에 호출)
// ─────────────────────────────────────────────────────────────────────────────

export interface BakerConfig {
  /** 타입 자동 변환 ("123" → 123). @default false */
  autoConvert?: boolean;
  /** input에 키 없으면 클래스 기본값 사용. @default false */
  allowClassDefaults?: boolean;
  /** 첫 에러에서 중단. @default false */
  stopAtFirstError?: boolean;
  /** 미선언 필드 조용히 제거. @default false */
  stripUnknown?: boolean;
}

let _globalOptions: SealOptions = { enableCircularCheck: 'auto' };

/**
 * baker 글로벌 설정. 첫 auto-seal 전에 호출.
 * 안 하면 기본값 적용.
 */
export function configure(config: BakerConfig): void {
  if (_isSealed()) {
    console.warn('[baker] configure() called after auto-seal. Already-sealed classes are not affected. Call configure() before the first deserialize/serialize.');
  }
  _globalOptions = {
    enableImplicitConversion: config.autoConvert ?? false,
    enableCircularCheck: 'auto',
    exposeDefaultValues: config.allowClassDefaults ?? false,
    stopAtFirstError: config.stopAtFirstError ?? false,
    whitelist: config.stripUnknown ?? false,
  };
}

/** @internal — seal에서 사용 */
export function _getGlobalOptions(): SealOptions {
  return _globalOptions;
}

/** @internal — unseal 시 기본값으로 리셋 */
export function _resetConfigForTesting(): void {
  _globalOptions = { enableCircularCheck: 'auto' };
}
