// ─────────────────────────────────────────────────────────────────────────────
// SealOptions — seal() 글로벌 옵션 (§1.4)
// ─────────────────────────────────────────────────────────────────────────────

export interface SealOptions {
  /**
   * validation 데코레이터를 타입 힌트로 활용한 자동 변환.
   * @default false
   */
  enableImplicitConversion?: boolean;
  /**
   * input에 해당 키가 없을 때 클래스 기본값을 사용.
   * @default false
   */
  exposeDefaultValues?: boolean;
  /**
   * true: 첫 에러 즉시 반환. false(기본): 전체 에러 수집.
   * @default false
   */
  stopAtFirstError?: boolean;
  /**
   * true: 미선언 필드 거부. mergeInheritance(Class)의 key 집합을 허용 목록으로 사용.
   * @Exclude 필드도 whitelist에 포함 — 존재는 허용하되 결과에서 제외.
   * @default false
   */
  whitelist?: boolean;
  /**
   * true: 생성 코드에 필드 제외 사유를 주석으로 포함.
   * @default false
   */
  debug?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// RuntimeOptions — deserialize/serialize 런타임 옵션 (§5.3)
// ─────────────────────────────────────────────────────────────────────────────

export interface RuntimeOptions {
  /** 요청별 groups — 요청마다 다를 수 있으므로 런타임에 전달 */
  groups?: string[];
}
