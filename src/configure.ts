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
  /** 미선언 필드를 에러로 거부. @default false */
  forbidUnknown?: boolean;
  /**
   * @deprecated `forbidUnknown`으로 이름이 변경됨. 이 옵션은 실제로 unknown 필드를
   * 조용히 제거하는 것이 아니라 에러를 발생시킴. `forbidUnknown`을 사용할 것.
   * `forbidUnknown`이 명시되면 `stripUnknown`은 무시됨.
   */
  stripUnknown?: boolean;
}

let _globalOptions: SealOptions = {};

export interface ConfigureResult {
  warnings: string[];
}

/**
 * baker 글로벌 설정. 첫 auto-seal 전에 호출.
 * 안 하면 기본값 적용.
 *
 * @returns `{ warnings }` — seal 후 호출 시 경고 메시지 포함.
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
  };
  return { warnings };
}

/** @internal — seal에서 사용 */
export function _getGlobalOptions(): SealOptions {
  return _globalOptions;
}

/** @internal — unseal 시 기본값으로 리셋 */
export function _resetConfigForTesting(): void {
  _globalOptions = {};
}
