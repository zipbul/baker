import { ensureMeta } from '../collect';
import { isAsyncFunction } from '../utils';
import type { EmittableRule, RawPropertyMeta, TypeDef } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// arrayOf — 배열 원소 검증 마커 (each: true 대체)
// ─────────────────────────────────────────────────────────────────────────────

const ARRAY_OF = Symbol.for('baker:arrayOf');

export interface ArrayOfMarker {
  readonly [key: symbol]: true;
  readonly rules: EmittableRule[];
}

/**
 * 배열의 각 원소에 규칙 적용.
 *
 * @example
 * @Field(arrayOf(isString(), minLength(1)))
 * tags!: string[];
 */
export function arrayOf(...rules: EmittableRule[]): ArrayOfMarker {
  const marker = { rules } as any;
  marker[ARRAY_OF] = true;
  return marker as ArrayOfMarker;
}

function isArrayOfMarker(arg: unknown): arg is ArrayOfMarker {
  return typeof arg === 'object' && arg !== null && (arg as any)[ARRAY_OF] === true;
}

// ─────────────────────────────────────────────────────────────────────────────
// FieldOptions — @Field 옵션 객체
// ─────────────────────────────────────────────────────────────────────────────

export interface FieldTransformParams {
  value: unknown;
  key: string;
  obj: Record<string, unknown>;
  direction: 'deserialize' | 'serialize';
}

export interface JsonSchemaOverride {
  title?: string;
  description?: string;
  default?: unknown;
  examples?: unknown[];
  [key: string]: unknown;
}

export interface FieldOptions {
  /** 중첩 DTO 타입. thunk — 순환 참조 지원. [Dto]면 배열. */
  type?: () => (new (...args: any[]) => any) | (new (...args: any[]) => any)[];
  /** 다형성 discriminator 설정 — type과 함께 사용 */
  discriminator?: {
    property: string;
    subTypes: { value: Function; name: string }[];
  };
  /** discriminator 프로퍼티를 결과 객체에 유지할지 여부 */
  keepDiscriminatorProperty?: boolean;
  /** 검증 규칙 배열 */
  rules?: (EmittableRule | ArrayOfMarker)[];
  /** undefined 허용 */
  optional?: boolean;
  /** null 허용 */
  nullable?: boolean;
  /** JSON 키 매핑 (양방향) */
  name?: string;
  /** deserialize 방향 키 매핑 (name과 동시 사용 불가) */
  deserializeName?: string;
  /** serialize 방향 키 매핑 (name과 동시 사용 불가) */
  serializeName?: string;
  /** 필드 제외 — true: 양방향, 'deserializeOnly': 역직렬화만, 'serializeOnly': 직렬화만 */
  exclude?: boolean | 'deserializeOnly' | 'serializeOnly';
  /** 그룹 — 필드 가시성 제어 + validation rule 조건부 적용 */
  groups?: string[];
  /** 조건부 검증 — false 시 필드 전체 검증 skip */
  when?: (obj: any) => boolean;
  /** JSON Schema 커스텀 (프로퍼티 레벨) */
  schema?: JsonSchemaOverride;
  /** 값 변환 함수 */
  transform?: (params: FieldTransformParams) => unknown;
  /** transform 방향 제한 */
  transformDirection?: 'deserializeOnly' | 'serializeOnly';
}

// ─────────────────────────────────────────────────────────────────────────────
// FieldOptions 감지 — EmittableRule/ArrayOfMarker와 구분
// ─────────────────────────────────────────────────────────────────────────────

const FIELD_OPTION_KEYS = new Set([
  'type', 'discriminator', 'keepDiscriminatorProperty', 'rules',
  'optional', 'nullable', 'name', 'deserializeName', 'serializeName',
  'exclude', 'groups', 'when', 'schema', 'transform', 'transformDirection',
]);

function isFieldOptions(arg: unknown): arg is FieldOptions {
  if (typeof arg === 'function') return false;
  if (typeof arg !== 'object' || arg === null) return false;
  if (isArrayOfMarker(arg)) return false;
  // 알려진 키가 하나라도 있으면 FieldOptions
  const keys = Object.keys(arg);
  if (keys.length === 0) return true; // @Field({})
  return keys.some(k => FIELD_OPTION_KEYS.has(k));
}

// ─────────────────────────────────────────────────────────────────────────────
// 내부 헬퍼 — Field() 데코레이터 분해
// ─────────────────────────────────────────────────────────────────────────────

type RuleArg = EmittableRule | ArrayOfMarker;

/** 4가지 오버로드 시그니처를 `{ rules, options }`로 정규화 */
function parseFieldArgs(args: any[]): { rules: RuleArg[]; options: FieldOptions } {
  if (args.length === 0) {
    // Form 1: @Field()
    return { rules: [], options: {} };
  }
  if (args.length === 1 && isFieldOptions(args[0])) {
    // Form 3: @Field({ type: () => Dto })
    const options = args[0] as FieldOptions;
    return { rules: options.rules ?? [], options };
  }
  // Form 2 or 4
  const lastArg = args[args.length - 1];
  if (isFieldOptions(lastArg)) {
    // Form 4: @Field(isString(), { optional: true })
    const options = lastArg as FieldOptions;
    let rules: RuleArg[] = args.slice(0, -1);
    if (options.rules) rules = [...rules, ...options.rules];
    return { rules, options };
  }
  // Form 2: @Field(isString(), email())
  return { rules: args, options: {} };
}

/** validation 규칙 등록 + arrayOf 처리 */
function applyValidation(meta: RawPropertyMeta, rules: RuleArg[], options: FieldOptions): void {
  for (const rule of rules) {
    if (isArrayOfMarker(rule)) {
      for (const innerRule of rule.rules) {
        meta.validation.push({
          rule: innerRule,
          each: true,
          groups: options.groups,
        });
      }
    } else {
      meta.validation.push({
        rule: rule as EmittableRule,
        groups: options.groups,
      });
    }
  }
}

/** expose 5-branch 로직 처리 */
function applyExpose(meta: RawPropertyMeta, options: FieldOptions): void {
  if (options.name) {
    meta.expose.push({ name: options.name, groups: options.groups });
  } else if (options.deserializeName || options.serializeName) {
    if (options.deserializeName) {
      meta.expose.push({ name: options.deserializeName, deserializeOnly: true, groups: options.groups });
    }
    if (options.serializeName) {
      meta.expose.push({ name: options.serializeName, serializeOnly: true, groups: options.groups });
    }
  } else if (options.groups) {
    meta.expose.push({ groups: options.groups });
  } else {
    meta.expose.push({});
  }
}

/** async 감지 + direction 래핑 + transform 등록 */
function applyTransform(meta: RawPropertyMeta, options: FieldOptions): void {
  if (!options.transform) return;
  const userFn = options.transform;
  const isAsync = isAsyncFunction(userFn);
  const wrapperFn = isAsync
    ? async (params: any) => userFn({
        value: params.value,
        key: params.key,
        obj: params.obj,
        direction: params.type,
      })
    : (params: any) => userFn({
        value: params.value,
        key: params.key,
        obj: params.obj,
        direction: params.type,
      });
  if (options.transformDirection && options.transformDirection !== 'deserializeOnly' && options.transformDirection !== 'serializeOnly') {
    throw new Error(`Invalid transformDirection: "${options.transformDirection}". Expected 'deserializeOnly' or 'serializeOnly'.`);
  }
  const transformOptions: any = {};
  if (options.transformDirection === 'deserializeOnly') transformOptions.deserializeOnly = true;
  if (options.transformDirection === 'serializeOnly') transformOptions.serializeOnly = true;
  meta.transform.push({
    fn: wrapperFn,
    options: Object.keys(transformOptions).length > 0 ? transformOptions : undefined,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// @Field — 필드 데코레이터 (4가지 오버로드)
// ─────────────────────────────────────────────────────────────────────────────

/** @Field() — 빈 필드 등록 */
export function Field(): PropertyDecorator;
/** @Field(isString(), email()) — 가변 인자 규칙 */
export function Field(...rules: RuleArg[]): PropertyDecorator;
/** @Field({ type: () => Dto }) — 옵션 객체 */
export function Field(options: FieldOptions): PropertyDecorator;
/** @Field(isString(), { optional: true }) — 규칙 + 옵션 혼합 */
export function Field(...rulesAndOptions: [...RuleArg[], FieldOptions]): PropertyDecorator;
export function Field(...args: any[]): PropertyDecorator {
  return (target, key) => {
    const ctor = (target as any).constructor;
    const propertyKey = key as string;
    const meta = ensureMeta(ctor, propertyKey);

    const { rules, options } = parseFieldArgs(args);

    applyValidation(meta, rules, options);

    // ── flags ──
    if (options.optional) meta.flags.isOptional = true;
    if (options.nullable) meta.flags.isNullable = true;
    if (options.when) meta.flags.validateIf = options.when;

    // ── type (중첩 DTO + discriminator) ──
    if (options.type) {
      meta.type = {
        fn: options.type as TypeDef['fn'],
        discriminator: options.discriminator,
        keepDiscriminatorProperty: options.keepDiscriminatorProperty,
      };
    }

    applyExpose(meta, options);

    // ── exclude ──
    if (options.exclude) {
      if (options.exclude === true) {
        meta.exclude = {};
      } else if (options.exclude === 'deserializeOnly') {
        meta.exclude = { deserializeOnly: true };
      } else if (options.exclude === 'serializeOnly') {
        meta.exclude = { serializeOnly: true };
      }
    }

    applyTransform(meta, options);

    // ── schema ──
    if (options.schema) {
      if (typeof meta.schema === 'function') {
        // 기존 함수형 유지
      } else {
        meta.schema = { ...(meta.schema ?? {}), ...options.schema } as Record<string, unknown>;
      }
    }
  };
}
