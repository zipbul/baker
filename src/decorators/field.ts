import { ensureMeta } from '../collect';
import type { EmittableRule, TypeDef } from '../types';

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
  /** 검증 규칙 배열 */
  rules?: (EmittableRule | ArrayOfMarker)[];
  /** undefined 허용 */
  optional?: boolean;
  /** null 허용 */
  nullable?: boolean;
  /** JSON 키 매핑 (양방향) */
  name?: string;
  /** 필드 가시성 그룹 */
  groups?: string[];
  /** 조건부 검증 — false 시 필드 전체 검증 skip */
  when?: (obj: any) => boolean;
  /** JSON Schema 커스텀 (프로퍼티 레벨) */
  schema?: JsonSchemaOverride;
  /** 값 변환 함수 */
  transform?: (params: FieldTransformParams) => unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// FieldOptions 감지 — EmittableRule/ArrayOfMarker와 구분
// ─────────────────────────────────────────────────────────────────────────────

function isFieldOptions(arg: unknown): arg is FieldOptions {
  if (typeof arg === 'function') return false;
  if (typeof arg !== 'object' || arg === null) return false;
  if (isArrayOfMarker(arg)) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// @Field — 필드 데코레이터 (4가지 오버로드)
// ─────────────────────────────────────────────────────────────────────────────

type RuleArg = EmittableRule | ArrayOfMarker;

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

    // ── 인자 파싱 ──
    let options: FieldOptions = {};
    let ruleArgs: RuleArg[] = [];

    if (args.length === 0) {
      // Form 1: @Field()
    } else if (args.length === 1 && isFieldOptions(args[0])) {
      // Form 3: @Field({ type: () => Dto })
      options = args[0];
      ruleArgs = options.rules ?? [];
    } else {
      // Form 2 or 4
      const lastArg = args[args.length - 1];
      if (isFieldOptions(lastArg)) {
        // Form 4: @Field(isString(), { optional: true })
        options = lastArg;
        ruleArgs = args.slice(0, -1);
        if (options.rules) ruleArgs = [...ruleArgs, ...options.rules];
      } else {
        // Form 2: @Field(isString(), email())
        ruleArgs = args;
      }
    }

    // ── validation 등록 ──
    for (const rule of ruleArgs) {
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

    // ── flags ──
    if (options.optional) meta.flags.isOptional = true;
    if (options.nullable) meta.flags.isNullable = true;
    if (options.when) meta.flags.validateIf = options.when;

    // ── type (중첩 DTO) ──
    if (options.type) {
      meta.type = { fn: options.type as TypeDef['fn'] };
    }

    // ── name → expose ──
    if (options.name) {
      meta.expose.push({ name: options.name });
    }

    // ── transform ──
    if (options.transform) {
      const userFn = options.transform;
      const isAsync = userFn.constructor?.name === 'AsyncFunction';
      const wrapperFn = isAsync
        ? async (params: any) => userFn({
            value: params.value,
            obj: params.obj,
            direction: params.type,
          })
        : (params: any) => userFn({
            value: params.value,
            obj: params.obj,
            direction: params.type,
          });
      meta.transform.push({ fn: wrapperFn });
    }

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
