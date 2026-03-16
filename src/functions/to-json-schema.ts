import { RAW_CLASS_SCHEMA, SEALED } from '../symbols';
import { mergeInheritance } from '../seal/seal';
import type { RawClassMeta, RawPropertyMeta, RuleDef, JsonSchema202012, SealedExecutors } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// ToJsonSchemaOptions (§6.4)
// ─────────────────────────────────────────────────────────────────────────────

export interface ToJsonSchemaOptions {
  direction?: 'deserialize' | 'serialize';
  groups?: string[];
  /** true: 모든 object 스키마에 unevaluatedProperties: false 추가 (seal의 whitelist 옵션 대응) */
  whitelist?: boolean;
  /** 클래스 레벨 JSON Schema 메타데이터 (title, description 등) */
  title?: string;
  description?: string;
  $id?: string;
  /** 매핑되지 않은 규칙에 대한 콜백 (기본: console.warn) */
  onUnmappedRule?: (ruleName: string, fieldKey: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// 내부 컨텍스트 — toJsonSchema 호출 단위로 생성
// ─────────────────────────────────────────────────────────────────────────────

interface SchemaContext {
  direction: 'deserialize' | 'serialize';
  groups?: string[];
  whitelist?: boolean;
  /** 현재 재귀 스택에 있는 클래스 (순환 감지) */
  processing: Set<Function>;
  /** Class → $defs 키 매핑 */
  defKeyMap: Map<Function, string>;
  /** $defs 누적 */
  defs: Record<string, JsonSchema202012>;
  /** 동명 클래스 disambiguation 카운터 */
  nameCounter: Map<string, number>;
  /** 매핑되지 않은 규칙 콜백 */
  onUnmappedRule?: (ruleName: string, fieldKey: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// composition-aware merge 키워드 (§6.5)
// ─────────────────────────────────────────────────────────────────────────────

const COMPOSITION_KEYWORDS = new Set([
  'allOf', 'anyOf', 'oneOf', 'not', 'if', 'then', 'else',
]);

// ─────────────────────────────────────────────────────────────────────────────
// 매핑 테이블: ruleName → JSON Schema 키워드 (§6.3)
// ─────────────────────────────────────────────────────────────────────────────

const RULE_SCHEMA_MAP: Record<string, (c: Record<string, unknown>) => JsonSchema202012 | null> = {
  // 타입
  isString:  () => ({ type: 'string' }),
  isNumber:  () => ({ type: 'number' }),
  isInt:     () => ({ type: 'integer' }),
  isBoolean: () => ({ type: 'boolean' }),
  isDate:    () => ({ type: 'string', format: 'date-time' }),
  isArray:   () => ({ type: 'array' }),
  isObject:  () => ({ type: 'object' }),

  // enum / const
  isEnum:   (c) => ({ enum: c.values as unknown[] }),
  isIn:     (c) => ({ enum: c.values as unknown[] }),
  equals:   (c) => ({ const: c.value }),
  notEquals: (c) => ({ not: { const: c.value } }),
  isNotIn:  (c) => ({ not: { enum: c.values as unknown[] } }),

  // 숫자
  min: (c) => c.exclusive
    ? { exclusiveMinimum: c.min as number }
    : { minimum: c.min as number },
  max: (c) => c.exclusive
    ? { exclusiveMaximum: c.max as number }
    : { maximum: c.max as number },
  isPositive:    () => ({ exclusiveMinimum: 0 }),
  isNegative:    () => ({ exclusiveMaximum: 0 }),
  isDivisibleBy: (c) => ({ multipleOf: c.divisor as number }),

  // 문자열
  minLength: (c) => ({ minLength: c.min as number }),
  maxLength: (c) => ({ maxLength: c.max as number }),
  length:    (c) => ({ minLength: c.min as number, maxLength: c.max as number }),
  matches:   (c) => ({ pattern: c.pattern as string }),

  // format 계열
  isEmail:   () => ({ format: 'email' }),
  isURL:     () => ({ format: 'uri' }),
  isUUID:    () => ({ format: 'uuid' }),
  isISO8601: () => ({ format: 'date-time' }),
  isIP: (c) => {
    if (c.version === 4) return { format: 'ipv4' };
    if (c.version === 6) return { format: 'ipv6' };
    return null; // 버전 미지정 → 스키마 매핑 없음
  },

  // 배열
  arrayMinSize:  (c) => ({ minItems: c.min as number }),
  arrayMaxSize:  (c) => ({ maxItems: c.max as number }),
  arrayUnique:   () => ({ uniqueItems: true }),
  arrayNotEmpty: () => ({ minItems: 1 }),
  arrayContains: (c) => ({ contains: { enum: c.values as unknown[] } }),

  // 객체
  isNotEmptyObject: () => ({ minProperties: 1 }),
};

// ─────────────────────────────────────────────────────────────────────────────
// toJsonSchema() — 엔트리포인트 (§6.1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 등록된 DTO 클래스를 JSON Schema Draft 2020-12 형식으로 변환한다.
 * - 루트 클래스는 인라인, 중첩 클래스는 $defs에 배치
 * - 순환 참조는 $ref로 안전 처리
 * - seal() 이전에도 호출 가능 (RAW 메타데이터 직접 사용)
 */
export function toJsonSchema(Class: Function, options?: ToJsonSchemaOptions): JsonSchema202012 {
  const ctx: SchemaContext = {
    direction: options?.direction ?? 'deserialize',
    groups: options?.groups,
    whitelist: options?.whitelist,
    processing: new Set(),
    defKeyMap: new Map(),
    defs: {},
    nameCounter: new Map(),
    onUnmappedRule: options?.onUnmappedRule,
  };

  // 루트 클래스 인라인 구축 (processNestedClass가 아닌 직접 호출)
  ctx.processing.add(Class);
  const bodySchema = buildClassSchema(Class, ctx);
  ctx.processing.delete(Class);

  // 순환 참조로 루트가 $ref된 경우 → $defs에도 등록
  if (ctx.defKeyMap.has(Class)) {
    ctx.defs[ctx.defKeyMap.get(Class)!] = bodySchema;
  }

  // 최종 루트 스키마 조립
  const rootSchema: JsonSchema202012 = { ...bodySchema };
  rootSchema.$schema = 'https://json-schema.org/draft/2020-12/schema';

  if (Object.keys(ctx.defs).length > 0) {
    rootSchema.$defs = ctx.defs;
  }

  // 클래스 레벨 @Schema 병합 (키별 deep merge)
  const classSchema = (Class as any)[RAW_CLASS_SCHEMA] as Record<string, unknown> | undefined;
  if (classSchema) {
    for (const [key, val] of Object.entries(classSchema)) {
      if (key === 'properties' || key === '$defs') {
        (rootSchema as any)[key] = { ...((rootSchema as any)[key] as object ?? {}), ...(val as object) };
      } else if (key === 'required') {
        rootSchema.required = [...new Set([...(rootSchema.required ?? []), ...(val as string[])])];
      } else {
        (rootSchema as any)[key] = val;
      }
    }
  }

  // toJsonSchema 호출 시 전달된 클래스 레벨 메타데이터
  if (options?.title) rootSchema.title = options.title;
  if (options?.description) rootSchema.description = options.description;
  if (options?.$id) rootSchema.$id = options.$id;

  return rootSchema;
}

// ─────────────────────────────────────────────────────────────────────────────
// getDefKey — 동명 클래스 disambiguation (§6.2)
// ─────────────────────────────────────────────────────────────────────────────

function getDefKey(C: Function, ctx: SchemaContext): string {
  const existing = ctx.defKeyMap.get(C);
  if (existing !== undefined) return existing;

  const name = C.name || 'Anonymous';
  const count = ctx.nameCounter.get(name) ?? 0;
  ctx.nameCounter.set(name, count + 1);
  const key = count === 0 ? name : `${name}_${count + 1}`;
  ctx.defKeyMap.set(C, key);
  return key;
}

// ─────────────────────────────────────────────────────────────────────────────
// processNestedClass — 중첩 DTO → $ref (§6.2)
// ─────────────────────────────────────────────────────────────────────────────

function processNestedClass(C: Function, ctx: SchemaContext): JsonSchema202012 {
  // 이미 완료 → $ref
  const existingKey = ctx.defKeyMap.get(C);
  if (existingKey !== undefined && existingKey in ctx.defs) {
    return { $ref: `#/$defs/${existingKey}` };
  }

  // 순환 감지: 현재 스택에 있으면 $ref (스키마는 나중에 채워짐)
  if (ctx.processing.has(C)) {
    const defKey = getDefKey(C, ctx);
    return { $ref: `#/$defs/${defKey}` };
  }

  // 새 클래스 처리
  const defKey = getDefKey(C, ctx);
  ctx.processing.add(C);
  const schema = buildClassSchema(C, ctx);
  ctx.processing.delete(C);
  ctx.defs[defKey] = schema;

  return { $ref: `#/$defs/${defKey}` };
}

// ─────────────────────────────────────────────────────────────────────────────
// buildClassSchema — 클래스 → { type: "object", properties, required } (§6.1)
// ─────────────────────────────────────────────────────────────────────────────

function buildClassSchema(C: Function, ctx: SchemaContext): JsonSchema202012 {
  const sealed = (C as any)[SEALED] as SealedExecutors<unknown> | undefined;
  const merged: RawClassMeta = sealed?._merged ?? mergeInheritance(C);
  const properties: Record<string, JsonSchema202012> = {};
  const required: string[] = [];

  for (const [fieldKey, meta] of Object.entries(merged)) {
    // @Exclude 방향 필터링 + @Expose name 결정 (§6.9)
    const schemaKey = getSchemaKey(meta, fieldKey, ctx.direction);
    if (schemaKey === null) continue;

    // @Expose groups 필터링 (§6.4)
    if (ctx.groups) {
      const dirExposes = meta.expose.filter(e => {
        if (ctx.direction === 'deserialize' && e.serializeOnly) return false;
        if (ctx.direction === 'serialize' && e.deserializeOnly) return false;
        return true;
      });
      if (dirExposes.length > 0) {
        const anyMatch = dirExposes.some(e => {
          if (!e.groups || e.groups.length === 0) return true;
          return e.groups.some(g => ctx.groups!.includes(g));
        });
        if (!anyMatch) continue;
      } else if (meta.validation.length > 0 && meta.validation.every(rd => rd.groups && rd.groups.length > 0)) {
        // 모든 규칙이 groups 지정 → 필드 레벨 groups 필터 적용
        const anyRuleMatch = meta.validation.some(rd =>
          rd.groups!.some(g => ctx.groups!.includes(g)),
        );
        if (!anyRuleMatch) continue;
      }
    }

    // 프로퍼티 스키마 구축
    const propSchema = buildPropertySchema(meta, ctx);
    properties[schemaKey] = propSchema;

    // required 결정: @IsOptional이 아니면 required
    if (!meta.flags.isOptional) {
      required.push(schemaKey);
    }
  }

  const schema: JsonSchema202012 = { type: 'object', properties };
  if (required.length > 0) schema.required = required;
  if (ctx.whitelist) schema.unevaluatedProperties = false;

  return schema;
}

// ─────────────────────────────────────────────────────────────────────────────
// getSchemaKey — @Exclude/@Expose 방향 인식 키 결정 (§6.9)
// ─────────────────────────────────────────────────────────────────────────────

function getSchemaKey(
  meta: RawPropertyMeta, fieldKey: string, direction: string,
): string | null {
  // @Exclude 필터링
  if (meta.exclude) {
    if (!meta.exclude.deserializeOnly && !meta.exclude.serializeOnly) return null;
    if (direction === 'deserialize' && !meta.exclude.serializeOnly) return null;
    if (direction === 'serialize' && !meta.exclude.deserializeOnly) return null;
  }

  // @Expose name (방향 매칭 — 첫 번째 매칭 사용)
  const expose = meta.expose.find(e => {
    if (direction === 'deserialize' && e.serializeOnly) return false;
    if (direction === 'serialize' && e.deserializeOnly) return false;
    return true;
  });
  return expose?.name ?? fieldKey;
}

// ─────────────────────────────────────────────────────────────────────────────
// buildPropertySchema — 프로퍼티 메타 → JSON Schema (§6.3, §6.10, §6.11)
// ─────────────────────────────────────────────────────────────────────────────

function buildPropertySchema(meta: RawPropertyMeta, ctx: SchemaContext): JsonSchema202012 {
  // @Type/@Nested → $ref 또는 discriminator
  if (meta.type) {
    return buildNestedTypeSchema(meta, ctx);
  }

  // each / non-each 룰 분리 (§6.10)
  const nonEachRules = filterByGroups(
    meta.validation.filter(rd => !rd.each), ctx.groups,
  );
  const eachRules = filterByGroups(
    meta.validation.filter(rd => rd.each), ctx.groups,
  );

  // 자동 매핑
  const autoSchema = mapRulesToSchema(nonEachRules);

  // each:true → items 서브스키마
  if (eachRules.length > 0) {
    const itemSchema = mapRulesToSchema(eachRules);
    if (Object.keys(itemSchema).length > 0) {
      autoSchema.items = itemSchema;
    }
  }

  // @IsNullable → type 배열 (§6.11)
  if (meta.flags.isNullable) {
    applyNullable(autoSchema);
  }

  // @Schema 병합 (§6.5, §6.6)
  return applyUserSchema(meta, autoSchema);
}

// ─────────────────────────────────────────────────────────────────────────────
// buildNestedTypeSchema — @Type/@Nested → $ref / discriminator (§6.3)
// ─────────────────────────────────────────────────────────────────────────────

function buildNestedTypeSchema(
  meta: RawPropertyMeta, ctx: SchemaContext,
): JsonSchema202012 {
  let innerSchema: JsonSchema202012;

  if (meta.type!.discriminator) {
    // discriminator → oneOf + const 패턴
    const { property, subTypes } = meta.type!.discriminator;
    const oneOf: JsonSchema202012[] = subTypes.map(sub => {
      const ref = processNestedClass(sub.value as Function, ctx);
      return {
        allOf: [
          ref,
          { properties: { [property]: { const: sub.name } }, required: [property] },
        ],
      };
    });
    innerSchema = { oneOf };
  } else {
    // 단순 중첩 참조
    const nestedClass = meta.type!.resolvedClass ?? meta.type!.fn() as Function;
    innerSchema = processNestedClass(nestedClass, ctx);
  }

  // each:true / validateNestedEach → 배열 래핑
  const isArray = meta.type?.isArray || meta.flags.validateNestedEach;
  if (isArray) {
    const schema: JsonSchema202012 = { type: 'array', items: innerSchema };

    // 배열 레벨 룰 (minItems, maxItems, uniqueItems)
    const arrayRules = filterByGroups(
      meta.validation.filter(rd => !rd.each), ctx.groups,
    );
    const arrayKeywords = mapRulesToSchema(arrayRules);
    if (arrayKeywords.minItems !== undefined) schema.minItems = arrayKeywords.minItems;
    if (arrayKeywords.maxItems !== undefined) schema.maxItems = arrayKeywords.maxItems;
    if (arrayKeywords.uniqueItems !== undefined) schema.uniqueItems = arrayKeywords.uniqueItems;

    if (meta.flags.isNullable) applyNullable(schema);
    return applyUserSchema(meta, schema);
  }

  if (meta.flags.isNullable) {
    if (innerSchema.$ref) {
      innerSchema = { oneOf: [innerSchema, { type: 'null' }] };
    } else if (innerSchema.oneOf) {
      innerSchema = { oneOf: [...innerSchema.oneOf, { type: 'null' }] };
    } else {
      applyNullable(innerSchema);
    }
  }
  return applyUserSchema(meta, innerSchema);
}

// ─────────────────────────────────────────────────────────────────────────────
// 유틸리티 함수
// ─────────────────────────────────────────────────────────────────────────────

function filterByGroups(rules: RuleDef[], groups?: string[]): RuleDef[] {
  if (!groups) return rules;
  return rules.filter(rd => {
    if (!rd.groups || rd.groups.length === 0) return true;
    return rd.groups.some(g => groups.includes(g));
  });
}

function mapRulesToSchema(rules: RuleDef[]): JsonSchema202012 {
  const schema: JsonSchema202012 = {};
  for (const rd of rules) {
    const mapper = RULE_SCHEMA_MAP[rd.rule.ruleName];
    if (!mapper) continue;
    const result = mapper(rd.rule.constraints ?? {});
    if (!result) continue;
    Object.assign(schema, result);
  }
  return schema;
}

function applyNullable(schema: JsonSchema202012): void {
  if (schema.type) {
    if (Array.isArray(schema.type)) {
      if (!schema.type.includes('null')) schema.type = [...schema.type, 'null'];
    } else {
      schema.type = schema.type === 'null' ? ['null'] : [schema.type, 'null'];
    }
  } else {
    schema.type = ['null'];
  }
}

function applyUserSchema(
  meta: RawPropertyMeta, autoSchema: JsonSchema202012,
): JsonSchema202012 {
  if (meta.schema == null) return autoSchema;

  if (typeof meta.schema === 'function') {
    // 함수형: auto 스키마를 인자로 전달, 결과 반환
    return meta.schema(autoSchema) as JsonSchema202012;
  }

  // 객체형: composition-aware merge (§6.5)
  const userSchema = meta.schema as JsonSchema202012;
  const hasComposition = Object.keys(userSchema).some(k => COMPOSITION_KEYWORDS.has(k));
  return hasComposition ? { ...autoSchema, ...userSchema } : { ...autoSchema, ...userSchema };
}
