// ─────────────────────────────────────────────────────────────────────────────
// EmitContext — 코드 생성 컨텍스트 (§4.7)
// ─────────────────────────────────────────────────────────────────────────────

export interface EmitContext {
  /** RegExp 참조 배열에 등록, 인덱스 반환 */
  addRegex(re: RegExp): number;
  /** 참조 배열에 등록, 인덱스 반환 — 함수, 배열, Set, 원시값 등 */
  addRef(value: unknown): number;
  /** SealedExecutors 객체 참조 배열에 등록 — 중첩 @Type DTO용 */
  addExecutor(executor: SealedExecutors<unknown>): number;
  /** 에러 코드로 실패 처리 코드 문자열 생성 — path는 builder가 바인딩 */
  fail(code: string): string;
  /** 에러 수집 모드 여부 (= !stopAtFirstError) */
  collectErrors: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// EmittableRule — 검증 함수 + .emit() (§4.7, §4.8)
// ─────────────────────────────────────────────────────────────────────────────

export interface EmittableRule {
  (value: unknown): boolean | Promise<boolean>;
  emit(varName: string, ctx: EmitContext): string;
  readonly ruleName: string;
  /**
   * builder가 typeof 가드 삽입 여부를 판단하는 메타.
   * 해당 타입을 전제하는 rule만 설정 (예: isEmail → 'string').
   * @IsString 자체는 undefined (자체 typeof 포함).
   */
  readonly requiresType?: 'string' | 'number' | 'boolean' | 'date';
  /** 룰 파라미터를 외부에서 읽을 수 있도록 노출 — toJsonSchema 매핑에 사용 */
  readonly constraints?: Record<string, unknown>;
  /** async validate 함수 사용 시 true — deserialize-builder가 await 코드를 생성 */
  readonly isAsync?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// RuleDef / TransformDef / ExposeDef / ExcludeDef / TypeDef (§2.1)
// ─────────────────────────────────────────────────────────────────────────────

/** 사용자 정의 메시지 콜백 인자 */
export interface MessageArgs {
  property: string;
  value: unknown;
  constraints: Record<string, unknown>;
}

export interface RuleDef {
  rule: EmittableRule;
  each?: boolean;
  groups?: string[];
  /** 검증 실패 시 BakerError.message에 포함할 값 */
  message?: string | ((args: MessageArgs) => string);
  /** 검증 실패 시 BakerError.context에 포함할 임의 값 */
  context?: unknown;
}

/** @Transform 콜백 시그니처 */
export type TransformFunction = (params: TransformParams) => unknown;

export interface TransformParams {
  value: unknown;
  key: string;
  /** deserialize: input 원본 객체, serialize: class 인스턴스 */
  obj: Record<string, unknown>;
  type: 'deserialize' | 'serialize';
}

export interface TransformDef {
  fn: TransformFunction;
  options?: {
    groups?: string[];
    deserializeOnly?: boolean;
    serializeOnly?: boolean;
  };
}

export interface ExposeDef {
  name?: string;
  groups?: string[];
  deserializeOnly?: boolean;
  serializeOnly?: boolean;
}

export interface ExcludeDef {
  deserializeOnly?: boolean;
  serializeOnly?: boolean;
}

export interface TypeDef {
  fn: () => (new (...args: any[]) => any) | (new (...args: any[]) => any)[];
  discriminator?: {
    property: string;
    subTypes: { value: Function; name: string }[];
  };
  keepDiscriminatorProperty?: boolean;
  /** seal() 정규화 결과 — fn()이 배열을 반환하면 true */
  isArray?: boolean;
  /** seal() 정규화 결과 — fn() 해석 후 캐시된 클래스 (프리미티브 제외, DTO만) */
  resolvedClass?: new (...args: any[]) => any;
}

// ─────────────────────────────────────────────────────────────────────────────
// PropertyFlags — @IsOptional, @IsDefined, @ValidateIf, @ValidateNested (§2.1)
// ─────────────────────────────────────────────────────────────────────────────

export interface PropertyFlags {
  /** @IsOptional() — undefined/null 시 validation 전체 skip */
  isOptional?: boolean;
  /** @IsDefined() — undefined 불허 (@IsOptional 오버라이드). 현재 코드는 undefined만 거부, null은 후속 검증에 위임 */
  isDefined?: boolean;
  /** @IsNullable() — null 허용+할당, undefined는 거부 */
  isNullable?: boolean;
  /** @ValidateIf(cond) — false 시 필드 전체 검증 skip */
  validateIf?: (obj: any) => boolean;
  /** @ValidateNested() — 중첩 DTO 재귀 검증 트리거. @Type과 함께 사용 */
  validateNested?: boolean;
  /** @ValidateNested({ each: true }) — 배열 원소별 중첩 DTO 검증 */
  validateNestedEach?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// RawPropertyMeta — Class[RAW][propertyKey]에 저장되는 수집 데이터 (§2.1)
// ─────────────────────────────────────────────────────────────────────────────

export interface RawPropertyMeta {
  validation: RuleDef[];
  transform: TransformDef[];
  expose: ExposeDef[];
  exclude: ExcludeDef | null;
  type: TypeDef | null;
  flags: PropertyFlags;
  schema: Record<string, unknown> | ((auto: Record<string, unknown>) => Record<string, unknown>) | null;
}

export interface RawClassMeta {
  [propertyKey: string]: RawPropertyMeta;
}

// ─────────────────────────────────────────────────────────────────────────────
// SealedExecutors — Class[SEALED]에 저장되는 dual executor (§2.1)
// ─────────────────────────────────────────────────────────────────────────────

import type { RuntimeOptions } from './interfaces';
import type { BakerError } from './errors';
import type { Result, ResultAsync } from '@zipbul/result';

export interface SealedExecutors<T> {
  /** 내부 executor — Result 패턴. deserialize()가 감싸서 throw로 변환 */
  _deserialize(input: unknown, options?: RuntimeOptions): Result<T, BakerError[]> | ResultAsync<T, BakerError[]>;
  /** 내부 executor — 항상 성공. serialize는 무검증 전제 */
  _serialize(instance: T, options?: RuntimeOptions): Record<string, unknown> | Promise<Record<string, unknown>>;
  /** deserialize 방향에 async 규칙/transform/nested가 있으면 true */
  _isAsync: boolean;
  /** serialize 방향에 async transform/nested가 있으면 true */
  _isSerializeAsync: boolean;
  /** seal 시 병합된 메타데이터 캐시 — toJsonSchema에서 사용 (RAW 삭제 후에도 유효) */
  _merged?: RawClassMeta;
}

// ─────────────────────────────────────────────────────────────────────────────
// JsonSchema202012 — JSON Schema Draft 2020-12 타입 인터페이스 (§6.7)
// ─────────────────────────────────────────────────────────────────────────────

export interface JsonSchema202012 {
  // 핵심 구조
  $schema?: string;
  $id?: string;
  $ref?: string;
  $defs?: Record<string, JsonSchema202012>;
  $comment?: string;

  // 타입
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;

  // 숫자
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;

  // 문자열
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;

  // 배열
  items?: JsonSchema202012;
  prefixItems?: JsonSchema202012[];
  contains?: JsonSchema202012;
  minContains?: number;
  maxContains?: number;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;

  // 객체
  properties?: Record<string, JsonSchema202012>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema202012;
  unevaluatedProperties?: boolean | JsonSchema202012;
  patternProperties?: Record<string, JsonSchema202012>;
  propertyNames?: JsonSchema202012;
  minProperties?: number;
  maxProperties?: number;
  dependentRequired?: Record<string, string[]>;
  dependentSchemas?: Record<string, JsonSchema202012>;

  // 조합
  allOf?: JsonSchema202012[];
  anyOf?: JsonSchema202012[];
  oneOf?: JsonSchema202012[];
  not?: JsonSchema202012;
  if?: JsonSchema202012;
  then?: JsonSchema202012;
  else?: JsonSchema202012;

  // 어노테이션
  title?: string;
  description?: string;
  default?: unknown;
  examples?: unknown[];
  deprecated?: boolean;
  readOnly?: boolean;
  writeOnly?: boolean;

  // 컨텐츠
  contentEncoding?: string;
  contentMediaType?: string;
  contentSchema?: JsonSchema202012;

  // 확장 (사용자 커스텀)
  [key: string]: unknown;
}

