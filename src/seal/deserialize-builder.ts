import { err as _resultErr, isErr as _resultIsErr } from '@zipbul/result';
import type { Result, ResultAsync } from '@zipbul/result';
import { SEALED } from '../symbols';
import type { RawClassMeta, RawPropertyMeta, EmitContext, EmittableRule, SealedExecutors, RuleDef } from '../types';
import type { SealOptions, RuntimeOptions } from '../interfaces';
import { SealError, type BakerError } from '../errors';
import { isAsyncFunction } from '../utils';

// ─────────────────────────────────────────────────────────────────────────────
// Generated variable name prefixes — centralised to prevent typo-related bugs
// ─────────────────────────────────────────────────────────────────────────────

const GEN = {
  field: '__bk$f_',
  index: '__bk$i_',
  setIdx: '__bk$si_',
  setVal: '__bk$sv_',
  mapIdx: '__bk$mi_',
  mapVal: '__bk$mv_',
  mark: '__bk$mark_',
  skip: '__bk$skip_',
  result: '__bk$r_',
  errors: '__bk$re_',
  arr: '__bk$arr_',
  disc: '__bk$dt_',
  nestedIdx: '__bk$j_',
  out: '__bk$out',
  errList: '__bk$errors',
  groups: '__bk$groups',
  groupsSet: '__bk$groupsSet',
  key: '__bk$k',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — 코드 생성 유틸
// ─────────────────────────────────────────────────────────────────────────────

/** key를 유효한 JS 식별자 접미사로 변환 (비알파벳 문자를 charCode로 인코딩하여 충돌 방지) */
function sanitizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_]/g, (ch) => `$${ch.charCodeAt(0)}$`);
}

/** 필드명을 안전한 JS 변수명으로 변환 (내부 변수 충돌 방지 prefix 포함) */
function toVarName(key: string): string {
  return GEN.field + sanitizeKey(key);
}

/** 직렬화에 사용할 추출 키 결정 (§4.3 ③) */
function getDeserializeExtractKey(fieldKey: string, exposeStack: RawPropertyMeta['expose']): string {
  // deserializeOnly @Expose with name → 해당 name 사용
  const desDef = exposeStack.find(e => e.deserializeOnly && e.name);
  if (desDef) return desDef.name!;
  // 방향 미지정 @Expose with name → 양방향 사용
  const biDef = exposeStack.find(e => !e.deserializeOnly && !e.serializeOnly && e.name);
  if (biDef) return biDef.name!;
  return fieldKey;
}

/** 필드 expose groups 결정 — 무조건 노출 엔트리가 하나라도 있으면 undefined (제한 없음) */
function getDeserializeExposeGroups(exposeStack: RawPropertyMeta['expose']): string[] | undefined {
  const desEntries = exposeStack.filter(e => !e.serializeOnly);
  if (desEntries.length === 0) return undefined;
  // 그룹 제한 없는 엔트리가 하나라도 있으면 무조건 노출
  if (desEntries.some(e => !e.groups || e.groups.length === 0)) return undefined;
  // 모든 엔트리의 groups 병합
  const all = new Set<string>();
  for (const e of desEntries) for (const g of e.groups!) all.add(g);
  return [...all];
}

// ─────────────────────────────────────────────────────────────────────────────
// buildDeserializeCode — new Function 기반 executor 생성 (§4.9)
// ─────────────────────────────────────────────────────────────────────────────

export function buildDeserializeCode<T>(
  Class: Function,
  merged: RawClassMeta,
  options: SealOptions | undefined,
  needsCircularCheck: boolean,
  isAsync: boolean,
): (input: unknown, opts?: RuntimeOptions) => Result<T, BakerError[]> | ResultAsync<T, BakerError[]> {
  const stopAtFirstError = options?.stopAtFirstError ?? false;
  const collectErrors = !stopAtFirstError;
  const exposeDefaultValues = options?.exposeDefaultValues ?? false;

  // 참조 배열 — new Function 클로저에 주입
  const regexes: RegExp[] = [];
  const refs: unknown[] = [];
  const execs: SealedExecutors<unknown>[] = [];

  // ── 코드 생성 ────────────────────────────────────────────────────────────

  let body = '\'use strict\';\n';

  // 인스턴스 생성
  body += `var ${GEN.out} = new _Cls();\n`;

  // 에러 배열 (collectErrors mode)
  if (collectErrors) {
    body += `var ${GEN.errList} = [];\n`;
  }

  // preamble: input type guard (§4.9)
  body += 'if (input == null || typeof input !== \'object\' || Array.isArray(input)) return _err([{path:\'\',code:\'invalidInput\'}]);\n';

  // WeakSet guard (순환 참조)
  if (needsCircularCheck) {
    refs.push(new WeakSet());
    const wsIdx = refs.length - 1;
    body += `if (_refs[${wsIdx}].has(input)) return _err([{path:'',code:'circular'}]);\n`;
    body += `_refs[${wsIdx}].add(input);\n`;
  }

  // whitelist 체크 (§7.2) — 미선언 필드 거부
  if (options?.whitelist) {
    const allowedKeys = new Set<string>();
    for (const [fieldKey, meta] of Object.entries(merged)) {
      const extractKey = getDeserializeExtractKey(fieldKey, meta.expose);
      allowedKeys.add(extractKey);
    }
    const allowedIdx = refs.length;
    refs.push(allowedKeys);

    if (collectErrors) {
      body += `for (var ${GEN.key} of Object.keys(input)) { if (!_refs[${allowedIdx}].has(${GEN.key})) ${GEN.errList}.push({path:${GEN.key},code:'whitelistViolation'}); }\n`;
    } else {
      body += `for (var ${GEN.key} of Object.keys(input)) { if (!_refs[${allowedIdx}].has(${GEN.key})) return _err([{path:${GEN.key},code:'whitelistViolation'}]); }\n`;
    }
  }

  // groups 변수 — expose groups 또는 validation rule groups가 있을 때만 (§4.9, §M4)
  const hasGroupsField = Object.values(merged).some(meta => {
    const exposeGroups = getDeserializeExposeGroups(meta.expose);
    if (exposeGroups && exposeGroups.length > 0) return true;
    if (meta.validation.some(rd => rd.groups && rd.groups.length > 0)) return true;
    return false;
  });
  if (hasGroupsField) {
    body += `var ${GEN.groups} = _opts && _opts.groups;\n`;
    body += `var ${GEN.groupsSet} = ${GEN.groups} ? new Set(${GEN.groups}) : null;\n`;
  }

  // ── 필드별 코드 생성 ──────────────────────────────────────────────────────

  for (const [fieldKey, meta] of Object.entries(merged)) {
    const fieldCode = generateFieldCode(fieldKey, meta, {
      stopAtFirstError,
      collectErrors,
      exposeDefaultValues,
      isAsync,
      regexes,
      refs,
      execs,
      options,
    });
    body += fieldCode;
  }

  // ── epilogue ──────────────────────────────────────────────────────────────

  if (collectErrors) {
    body += `if (${GEN.errList}.length) return _err(${GEN.errList});\n`;
  }
  body += `return ${GEN.out};\n`;

  // sourceURL (§4.9)
  body += `//# sourceURL=baker://${Class.name}/deserialize\n`;

  // ── new Function 실행 ─────────────────────────────────────────────────────

  const fnKeyword = isAsync ? 'async function' : 'function';
  const executor = new Function(
    '_Cls', '_re', '_refs', '_execs', '_err', '_isErr',
    `return ${fnKeyword}(input, _opts) { ` + body + ' }',
  )(Class, regexes, refs, execs, _resultErr, _resultIsErr) as (
    input: unknown,
    opts?: RuntimeOptions,
  ) => Result<T, BakerError[]> | ResultAsync<T, BakerError[]>;

  return executor;
}

// ─────────────────────────────────────────────────────────────────────────────
// nullable/optional guard — truth-table strategy pattern (D-3)
// ─────────────────────────────────────────────────────────────────────────────

type GuardKey = 'nullable+optional' | 'nullable' | 'defined' | 'optional' | 'default';

function resolveGuardKey(isNullable: boolean, useOptionalGuard: boolean, isDefined: boolean): GuardKey {
  if (isNullable && useOptionalGuard) return 'nullable+optional';
  if (isNullable) return 'nullable';
  if (isDefined) return 'defined';
  if (useOptionalGuard) return 'optional';
  return 'default';
}

interface GuardParams {
  varName: string;
  emitCtx: EmitContext;
  assignNull: string;
  validationCode: string;
}

const GUARD_STRATEGIES: Record<GuardKey, (p: GuardParams) => string> = {
  // Case 4: @IsNullable + @IsOptional — null은 할당, undefined는 skip
  'nullable+optional'({ varName, assignNull, validationCode }) {
    let code = `if (${varName} === null) { ${assignNull}}\n`;
    code += `else if (${varName} !== undefined) {\n`;
    code += validationCode;
    code += '}\n';
    return code;
  },
  // Case 3: @IsNullable (+ optional @IsDefined — 동일 동작)
  'nullable'({ varName, emitCtx, assignNull, validationCode }) {
    let code = `if (${varName} === undefined) ${emitCtx.fail('isDefined')};\n`;
    code += `else if (${varName} !== null) {\n`;
    code += validationCode;
    code += `} else { ${assignNull}}\n`;
    return code;
  },
  // @IsDefined — undefined만 거부, null/""/0 등은 후속 검증으로 통과
  'defined'({ varName, emitCtx, validationCode }) {
    let code = `if (${varName} === undefined) ${emitCtx.fail('isDefined')};\n`;
    code += validationCode;
    return code;
  },
  // Case 2: @IsOptional — undefined/null 시 전체 skip
  'optional'({ varName, validationCode }) {
    let code = `if (${varName} !== undefined && ${varName} !== null) {\n`;
    code += validationCode;
    code += '}\n';
    return code;
  },
  // Case 1: 플래그 없음 (기본) — undefined/null 거부
  'default'({ varName, emitCtx, validationCode }) {
    let code = `if (${varName} === undefined || ${varName} === null) ${emitCtx.fail('isDefined')};\n`;
    code += `else {\n`;
    code += validationCode;
    code += '}\n';
    return code;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 필드 코드 생성
// ─────────────────────────────────────────────────────────────────────────────

interface FieldCodeContext {
  stopAtFirstError: boolean;
  collectErrors: boolean;
  exposeDefaultValues: boolean;
  isAsync: boolean;
  regexes: RegExp[];
  refs: unknown[];
  execs: SealedExecutors<unknown>[];
  options: SealOptions | undefined;
}

function generateFieldCode(
  fieldKey: string,
  meta: RawPropertyMeta,
  ctx: FieldCodeContext,
): string {
  const { collectErrors, exposeDefaultValues } = ctx;

  // ⓪ Exclude deserializeOnly / bidirectional → skip
  if (meta.exclude) {
    if (!meta.exclude.serializeOnly) {
      if (ctx.options?.debug) {
        const reason = meta.exclude.deserializeOnly ? 'deserializeOnly' : 'bidirectional';
        return `// [baker] field "${fieldKey}" excluded (${reason} @Exclude)\n`;
      }
      return '';
    }
  }

  // Expose: check if this field is exposed to deserialize
  // If all @Expose entries are serializeOnly, skip field
  if (meta.expose.length > 0 && meta.expose.every(e => e.serializeOnly)) {
    if (ctx.options?.debug) {
      return `// [baker] field "${fieldKey}" excluded (all @Expose entries are serializeOnly)\n`;
    }
    return '';
  }

  const varName = toVarName(fieldKey);
  const extractKey = getDeserializeExtractKey(fieldKey, meta.expose);
  const exposeGroups = getDeserializeExposeGroups(meta.expose);

  // EmitContext 생성
  const emitCtx = makeEmitCtx(fieldKey, ctx);

  let fieldCode = '';

  // ① @ValidateIf guard
  let validateIfIdx: number | null = null;
  if (meta.flags.validateIf) {
    validateIfIdx = ctx.refs.length;
    ctx.refs.push(meta.flags.validateIf);
  }

  // ③ 추출 (Extract) + exposeDefaultValues
  let extractCode: string;
  if (exposeDefaultValues && !meta.flags.isOptional) {
    // key가 input에 없으면 기본값 사용
    extractCode = `var ${varName} = (${JSON.stringify(extractKey)} in input) ? input[${JSON.stringify(extractKey)}] : ${GEN.out}[${JSON.stringify(fieldKey)}];\n`;
  } else {
    extractCode = `var ${varName} = input[${JSON.stringify(extractKey)}];\n`;
  }

  // groups check wrap (§4.5)
  let fieldStart = '';
  let fieldEnd = '';
  if (exposeGroups && exposeGroups.length > 0) {
    const groupsArr = JSON.stringify(exposeGroups);
    fieldStart = `if (${GEN.groupsSet} && ${groupsArr}.some(function(g){return ${GEN.groupsSet}.has(g);})) {\n`;
    fieldEnd = '}\n';
  }

  // inner content (extract + optional guard + validation + assign)
  let innerCode = extractCode;

  // ② null/undefined 가드 — @IsOptional, @IsNullable, @IsDefined 조합 (§4.3, Phase5)
  const useOptionalGuard = !!(meta.flags.isOptional && !meta.flags.isDefined);
  const isNullable = meta.flags.isNullable === true;

  const validationCode = generateValidationCode(fieldKey, varName, meta, ctx, emitCtx);
  const assignNull = `${GEN.out}[${JSON.stringify(fieldKey)}] = null;\n`;

  const guardKey = resolveGuardKey(isNullable, useOptionalGuard, meta.flags.isDefined ?? false);
  innerCode += GUARD_STRATEGIES[guardKey]({ varName, emitCtx, assignNull, validationCode });

  // ① @ValidateIf outer wrap
  if (validateIfIdx !== null) {
    fieldCode += fieldStart + `if (_refs[${validateIfIdx}](input)) {\n` + innerCode + '}\n' + fieldEnd;
  } else {
    fieldCode += fieldStart + innerCode + fieldEnd;
  }

  return fieldCode;
}

// ─────────────────────────────────────────────────────────────────────────────
// 검증 코드 생성 — 타입 가드 + transform + validate + assign
// ─────────────────────────────────────────────────────────────────────────────

function generateValidationCode(
  fieldKey: string,
  varName: string,
  meta: RawPropertyMeta,
  ctx: FieldCodeContext,
  emitCtx: EmitContext,
): string {
  const { collectErrors, execs } = ctx;

  let code = '';

  // @Transform (deserialize direction) — before validation (§4.3 ⑤)
  const dsTransforms = meta.transform.filter(
    td => !td.options?.serializeOnly,
  );
  if (dsTransforms.length > 0) {
    for (const td of dsTransforms) {
      const refIdx = ctx.refs.length;
      ctx.refs.push(td.fn);
      const isAsyncTransform = ctx.isAsync && isAsyncFunction(td.fn);
      const callExpr = `_refs[${refIdx}]({value:${varName},key:${JSON.stringify(fieldKey)},obj:input,type:'deserialize'})`;
      code += `${varName} = ${isAsyncTransform ? 'await ' : ''}${callExpr};\n`;
    }
  }

  // @ValidateNested + @Type (§8.1)
  if (meta.flags.validateNested && meta.type?.fn) {
    code += generateNestedCode(fieldKey, varName, meta, ctx, emitCtx);
    return code;
  }

  // No validation rules → direct assign
  if (meta.validation.length === 0) {
    code += `${GEN.out}[${JSON.stringify(fieldKey)}] = ${varName};\n`;
    return code;
  }

  // Build validation with type gate
  code += buildRulesCode(fieldKey, varName, meta.validation, collectErrors, emitCtx, ctx, meta);

  return code;
}

// ─────────────────────────────────────────────────────────────────────────────
// 규칙별 추가 필드(message/context) 코드 문자열 계산 헬퍼
// ─────────────────────────────────────────────────────────────────────────────

/** 규칙의 message/context 옵션을 generated code 내 extra 필드 문자열로 변환 */
function computeRuleExtras(
  rd: RuleDef,
  fieldKey: string,
  varName: string,
  ctx: FieldCodeContext,
): string {
  let extra = '';
  if (typeof rd.message === 'string') {
    extra += `,message:${JSON.stringify(rd.message)}`;
  } else if (typeof rd.message === 'function') {
    const msgIdx = ctx.refs.length;
    ctx.refs.push(rd.message as unknown);
    const constraintsIdx = ctx.refs.length;
    ctx.refs.push(rd.rule.constraints ?? {});
    extra += `,message:_refs[${msgIdx}]({property:${JSON.stringify(fieldKey)},value:${varName},constraints:_refs[${constraintsIdx}]})`;
  }
  if (rd.context !== undefined) {
    const ctxIdx = ctx.refs.length;
    ctx.refs.push(rd.context);
    extra += `,context:_refs[${ctxIdx}]`;
  }
  return extra;
}

/** 규칙별 EmitContext 생성 (message/context 오버라이드) */
function makeRuleEmitCtx(
  baseEmitCtx: EmitContext,
  fieldKey: string,
  varName: string,
  rd: RuleDef,
  ctx: FieldCodeContext,
): EmitContext {
  const extra = computeRuleExtras(rd, fieldKey, varName, ctx);
  if (!extra) return baseEmitCtx;
  return {
    ...baseEmitCtx,
    fail(code: string): string {
      if (baseEmitCtx.collectErrors) {
        return `${GEN.errList}.push({path:${JSON.stringify(fieldKey)},code:${JSON.stringify(code)}${extra}})`;
      } else {
        return `return _err([{path:${JSON.stringify(fieldKey)},code:${JSON.stringify(code)}${extra}}])`;
      }
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// wrapGroupsGuard — per-rule validation groups 체크 래퍼 (§M4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * rd.groups가 설정된 경우, 런타임 __bk$groups와 교집합이 있을 때만 코드를 실행.
 * groups 없는 규칙은 항상 실행 (기존 동작 유지).
 */
function wrapGroupsGuard(rd: RuleDef, code: string): string {
  if (!rd.groups || rd.groups.length === 0) return code;
  const groupsArr = JSON.stringify(rd.groups);
  return `if (!${GEN.groupsSet} || ${groupsArr}.some(function(g){return ${GEN.groupsSet}.has(g);})) {\n${code}\n}\n`;
}

// ─────────────────────────────────────────────────────────────────────────────
// generateConversionCode — enableImplicitConversion 변환 코드 생성
// ─────────────────────────────────────────────────────────────────────────────

function generateConversionCode(
  targetType: string,
  varName: string,
  fieldKey: string,
  skipVar: string | null, // null = stopAtFirstError
  collectErrors: boolean,
  emitCtx: EmitContext,
): string {
  const failCode = collectErrors
    ? `${GEN.errList}.push({path:${JSON.stringify(fieldKey)},code:'conversionFailed'}); ${skipVar} = true;`
    : emitCtx.fail('conversionFailed') + ';';

  switch (targetType) {
    case 'string':
      return `  ${varName} = String(${varName});\n`;
    case 'number':
      return `  ${varName} = Number(${varName});\n  if (isNaN(${varName})) { ${failCode} }\n`;
    case 'boolean':
      return (
        `  if (${varName} === 'true' || ${varName} === '1' || ${varName} === 1) ${varName} = true;\n` +
        `  else if (${varName} === 'false' || ${varName} === '0' || ${varName} === 0) ${varName} = false;\n` +
        `  else { ${failCode} }\n`
      );
    case 'date':
      return `  ${varName} = new Date(${varName});\n  if (isNaN(${varName}.getTime())) { ${failCode} }\n`;
    default:
      throw new SealError(`Unknown implicit conversion type: "${targetType}" for field "${fieldKey}"`);
  }
}

/** @Type() primitive builtin → target type mapping */
const PRIMITIVE_TYPE_HINTS: Record<string, string> = {
  Number: 'number', Boolean: 'boolean', String: 'string', Date: 'date',
};

/** Asserter rule name → gate type mapping */
const ASSERTER_TO_GATE: Record<string, string> = {
  isString: 'string', isNumber: 'number', isBoolean: 'boolean', isDate: 'date', isInt: 'number',
};

/** Asserters whose gate check fully subsumes the rule (skip emit inside gate) */
const GATE_ONLY_ASSERTERS = new Set(['isString', 'isBoolean']);

// ─────────────────────────────────────────────────────────────────────────────
// buildRulesCode — 타입 가드 + 마커 패턴 (§4.3, §4.10)
// Decomposed into: categorizeRules → resolveTypeGate → emitTypedRules / emitGeneralRules / emitEachRules
// ─────────────────────────────────────────────────────────────────────────────

/** Result of categorizeRules — each/nonEach split and typed dependency classification */
interface CategorizedRules {
  each: RuleDef[];
  generalRules: RuleDef[];
  /** The single typed dependency group (if any) after conflict check */
  typedDeps: { type: 'string' | 'number' | 'boolean' | 'date'; deps: RuleDef[] } | undefined;
}

/** categorizeRules — separate each/nonEach rules, detect mixed gate conflicts */
function categorizeRules(
  fieldKey: string,
  validation: RawPropertyMeta['validation'],
): CategorizedRules {
  const each = validation.filter(rd => rd.each);
  const nonEach = validation.filter(rd => !rd.each);

  // Separate by requiresType — 4-type gate support
  const stringDeps  = nonEach.filter(rd => rd.rule.requiresType === 'string');
  const numberDeps  = nonEach.filter(rd => rd.rule.requiresType === 'number');
  const booleanDeps = nonEach.filter(rd => rd.rule.requiresType === 'boolean');
  const dateDeps    = nonEach.filter(rd => rd.rule.requiresType === 'date');
  const generalRules = nonEach.filter(rd => !rd.rule.requiresType);

  // Mixed gate conflict detection
  const allTyped = [
    { type: 'string' as const, deps: stringDeps },
    { type: 'number' as const, deps: numberDeps },
    { type: 'boolean' as const, deps: booleanDeps },
    { type: 'date' as const, deps: dateDeps },
  ].filter(d => d.deps.length > 0);
  if (allTyped.length > 1) {
    throw new SealError(`Field "${fieldKey}" has conflicting requiresType: ${allTyped.map(d => d.type).join(', ')}`);
  }

  return {
    each,
    generalRules,
    typedDeps: allTyped.length > 0 ? allTyped[0] : undefined,
  };
}

/** Result of resolveTypeGate — effective gate type and related metadata */
interface ResolvedTypeGate {
  effectiveGateType: string | null;
  /** The typed dependency rules (from requiresType) */
  gateDeps: RuleDef[];
  /** Index of the type asserter within generalRules (-1 if none) */
  typeAsserterIdx: number;
  /** The type asserter rule def (if found) */
  typeAsserter: RuleDef | undefined;
  /** Whether conversion is enabled for this field */
  enableConversion: boolean;
  /** Whether this gate was inferred from asserter only (no typed deps) */
  asserterInferredGate: string | null;
  /** Whether this gate was inferred from @Type hint */
  typeHintGate: string | null;
}

/** resolveTypeGate — determine effective gate type from asserters/conversion/type hints */
function resolveTypeGate(
  fieldKey: string,
  categorized: CategorizedRules,
  meta: RawPropertyMeta | undefined,
  ctx: FieldCodeContext,
): ResolvedTypeGate {
  const { generalRules, typedDeps } = categorized;

  const hasTypedDeps = !!typedDeps;
  const gateType = typedDeps?.type ?? null;
  const gateDeps = typedDeps?.deps ?? [];

  // Find type asserter in generalRules matching gate type
  let typeAsserterIdx = -1;
  if (gateType) {
    typeAsserterIdx = generalRules.findIndex(rd => ASSERTER_TO_GATE[rd.rule.ruleName] === gateType);
  }

  // enableImplicitConversion check — skip if explicit @Transform for deserialize direction
  const enableConversion = !!(ctx.options?.enableImplicitConversion) &&
    !(meta?.transform.some(td => !td.options?.serializeOnly));

  // enableImplicitConversion: asserter-only gate 추론 — @IsNumber() 단독 사용 시에도 변환 gate 생성
  let asserterInferredGate: string | null = null;
  if (!hasTypedDeps && enableConversion && typeAsserterIdx < 0) {
    for (let i = 0; i < generalRules.length; i++) {
      const gate = ASSERTER_TO_GATE[generalRules[i]!.rule.ruleName];
      if (gate) {
        typeAsserterIdx = i;
        asserterInferredGate = gate;
        break;
      }
    }
  }

  const typeAsserter = typeAsserterIdx >= 0 ? generalRules[typeAsserterIdx] : undefined;

  // @Type() primitive hint — infer conversion target when no typed deps exist
  let typeHintGate: string | null = null;
  if (!hasTypedDeps && !asserterInferredGate && enableConversion && meta?.type?.fn) {
    try {
      const raw = meta.type.fn();
      const typeCtor = Array.isArray(raw) ? raw[0] : raw;
      typeHintGate = typeCtor ? PRIMITIVE_TYPE_HINTS[typeCtor.name] ?? null : null;
    } catch (e) { throw new SealError(`field "${fieldKey}": @Field type function threw: ${(e as Error).message}`); }
  }

  return {
    effectiveGateType: gateType ?? asserterInferredGate ?? typeHintGate,
    gateDeps,
    typeAsserterIdx,
    typeAsserter,
    enableConversion,
    asserterInferredGate,
    typeHintGate,
  };
}

/** Config object for emitTypedRules — bundles closure-captured vars into explicit parameter */
interface TypeGateConfig {
  effectiveGateType: string;
  gateCondition: string;
  gateErrorCode: string;
  gateEmitCtx: EmitContext;
  otherGeneral: RuleDef[];
  gateDeps: RuleDef[];
  typeAsserter: RuleDef | undefined;
  enableConversion: boolean;
}

/** emitTypedRules — generate type gate + inner validation code */
function emitTypedRules(
  fieldKey: string,
  varName: string,
  collectErrors: boolean,
  emitCtx: EmitContext,
  ctx: FieldCodeContext,
  config: TypeGateConfig,
): string {
  let code = '';

  const { effectiveGateType, gateCondition, gateErrorCode, gateEmitCtx, otherGeneral, gateDeps, typeAsserter, enableConversion } = config;

  // Helper: emit inner validation rules
  const emitInnerRules = (indent: string): string => {
    let inner = '';
    // typeAsserter emit — GATE_ONLY_ASSERTERS(isString,isBoolean)는 gate와 완전 중복이므로 스킵
    if (typeAsserter && !GATE_ONLY_ASSERTERS.has(typeAsserter.rule.ruleName)) {
      const taCode = wrapGroupsGuard(typeAsserter, typeAsserter.rule.emit(varName, makeRuleEmitCtx(emitCtx, fieldKey, varName, typeAsserter, ctx)));
      inner += indent + taCode.replace(/\n/g, '\n' + indent) + '\n';
    }
    for (const rd of otherGeneral) {
      const ruleCode = wrapGroupsGuard(rd, rd.rule.emit(varName, makeRuleEmitCtx(emitCtx, fieldKey, varName, rd, ctx)));
      inner += indent + ruleCode.replace(/\n/g, '\n' + indent) + '\n';
    }
    for (const rd of gateDeps) {
      const ruleCode = wrapGroupsGuard(rd, rd.rule.emit(varName, makeRuleEmitCtx(emitCtx, fieldKey, varName, rd, ctx)));
      inner += indent + ruleCode.replace(/\n/g, '\n' + indent) + '\n';
    }
    return inner;
  };

  if (collectErrors) {
    if (enableConversion) {
      // Conversion mode: try convert on gate failure, skip field if conversion fails
      const skipVar = `${GEN.skip}${sanitizeKey(fieldKey)}`;
      code += `var ${skipVar} = false;\n`;
      code += `if (${gateCondition}) {\n`;
      code += generateConversionCode(effectiveGateType, varName, fieldKey, skipVar, true, emitCtx);
      code += `}\n`;
      code += `if (!${skipVar}) {\n`;
      const markVar = `${GEN.mark}${sanitizeKey(fieldKey)}`;
      code += `  var ${markVar} = ${GEN.errList}.length;\n`;
      code += emitInnerRules('  ');
      code += `  if (${GEN.errList}.length === ${markVar}) ${GEN.out}[${JSON.stringify(fieldKey)}] = ${varName};\n`;
      code += `}\n`;
    } else {
      code += `if (${gateCondition}) ${gateEmitCtx.fail(gateErrorCode)};\n`;
      code += `else {\n`;
      const markVar = `${GEN.mark}${sanitizeKey(fieldKey)}`;
      code += `  var ${markVar} = ${GEN.errList}.length;\n`;
      code += emitInnerRules('  ');
      code += `  if (${GEN.errList}.length === ${markVar}) ${GEN.out}[${JSON.stringify(fieldKey)}] = ${varName};\n`;
      code += `}\n`;
    }
  } else {
    if (enableConversion) {
      code += `if (${gateCondition}) {\n`;
      code += generateConversionCode(effectiveGateType, varName, fieldKey, null, false, emitCtx);
      code += `}\n`;
      code += emitInnerRules('');
      code += `${GEN.out}[${JSON.stringify(fieldKey)}] = ${varName};\n`;
    } else {
      code += `if (${gateCondition}) ${gateEmitCtx.fail(gateErrorCode)};\n`;
      code += emitInnerRules('');
      code += `${GEN.out}[${JSON.stringify(fieldKey)}] = ${varName};\n`;
    }
  }

  return code;
}

/** emitGeneralRules — generate type-agnostic rule code */
function emitGeneralRules(
  fieldKey: string,
  varName: string,
  generalRules: RuleDef[],
  collectErrors: boolean,
  emitCtx: EmitContext,
  ctx: FieldCodeContext,
): string {
  let code = '';

  if (collectErrors) {
    if (generalRules.length === 0) {
      code += `${GEN.out}[${JSON.stringify(fieldKey)}] = ${varName};\n`;
    } else {
      const markVar = `${GEN.mark}${sanitizeKey(fieldKey)}`;
      code += `var ${markVar} = ${GEN.errList}.length;\n`;
      for (const rd of generalRules) {
        code += wrapGroupsGuard(rd, rd.rule.emit(varName, makeRuleEmitCtx(emitCtx, fieldKey, varName, rd, ctx))) + '\n';
      }
      code += `if (${GEN.errList}.length === ${markVar}) ${GEN.out}[${JSON.stringify(fieldKey)}] = ${varName};\n`;
    }
  } else {
    for (const rd of generalRules) {
      code += wrapGroupsGuard(rd, rd.rule.emit(varName, makeRuleEmitCtx(emitCtx, fieldKey, varName, rd, ctx))) + '\n';
    }
    code += `${GEN.out}[${JSON.stringify(fieldKey)}] = ${varName};\n`;
  }

  return code;
}

/** emitEachRules — generate Array/Set/Map each code */
function emitEachRules(
  fieldKey: string,
  varName: string,
  eachRules: RuleDef[],
  collectErrors: boolean,
  emitCtx: EmitContext,
  ctx: FieldCodeContext,
): string {
  let code = '';

  for (const rd of eachRules) {
    const pathKey = JSON.stringify(fieldKey);
    const sk = sanitizeKey(fieldKey);
    const iVar = `${GEN.index}${sk}`;
    const siVar = `${GEN.setIdx}${sk}`;
    const svVar = `${GEN.setVal}${sk}`;
    const miVar = `${GEN.mapIdx}${sk}`;
    const mvVar = `${GEN.mapVal}${sk}`;
    const extra = computeRuleExtras(rd, fieldKey, varName, ctx);
    const eachGuardOpen = (rd.groups && rd.groups.length > 0)
      ? `if (!${GEN.groupsSet} || ${JSON.stringify(rd.groups)}.some(function(g){return ${GEN.groupsSet}.has(g);})) {\n`
      : '';
    const eachGuardClose = (rd.groups && rd.groups.length > 0) ? '}\n' : '';

    // Collection descriptors: [idxVar, elemExpr, loopHeader, counterDecl, counterInc]
    const collections = [
      { guard: `Array.isArray(${varName})`, idxVar: iVar, elemExpr: `${varName}[${iVar}]`, loopHeader: `for (var ${iVar}=0; ${iVar}<${varName}.length; ${iVar}++)`, counterDecl: '', counterInc: '' },
      { guard: `${varName} instanceof Set`, idxVar: siVar, elemExpr: svVar, loopHeader: `for (var ${svVar} of ${varName})`, counterDecl: `var ${siVar} = 0;\n`, counterInc: `${siVar}++;\n` },
      { guard: `${varName} instanceof Map`, idxVar: miVar, elemExpr: mvVar, loopHeader: `for (var ${mvVar} of ${varName}.values())`, counterDecl: `var ${miVar} = 0;\n`, counterInc: `${miVar}++;\n` },
    ];

    const emitCollectionBlock = (col: typeof collections[number]): string => {
      const failFn = (c: string) => collectErrors
        ? `${GEN.errList}.push({path:${pathKey}+'['+${col.idxVar}+']',code:${JSON.stringify(c)}${extra}})`
        : `return _err([{path:${pathKey}+'['+${col.idxVar}+']',code:${JSON.stringify(c)}${extra}}])`;
      const colEmitCtx: EmitContext = { ...emitCtx, fail: failFn };
      let block = '';
      block += `  ${col.counterDecl}`;
      block += `  ${col.loopHeader} {\n`;
      block += '    ' + rd.rule.emit(col.elemExpr, colEmitCtx) + '\n';
      if (col.counterInc) block += `    ${col.counterInc}`;
      block += `  }\n`;
      return block;
    };

    code += eachGuardOpen;
    if (collectErrors) {
      code += `if (${collections[0]!.guard}) {\n`;
      code += emitCollectionBlock(collections[0]!);
      code += `} else if (${collections[1]!.guard}) {\n`;
      code += emitCollectionBlock(collections[1]!);
      code += `} else if (${collections[2]!.guard}) {\n`;
      code += emitCollectionBlock(collections[2]!);
      code += `} else { ${GEN.errList}.push({path:${pathKey},code:'isArray'}); }\n`;
    } else {
      code += `if (!${collections[0]!.guard} && !(${varName} instanceof Set) && !(${varName} instanceof Map)) ${emitCtx.fail('isArray')};\n`;
      code += `if (${collections[0]!.guard}) {\n`;
      code += emitCollectionBlock(collections[0]!);
      code += `} else if (${collections[1]!.guard}) {\n`;
      code += emitCollectionBlock(collections[1]!);
      code += `} else if (${collections[2]!.guard}) {\n`;
      code += emitCollectionBlock(collections[2]!);
      code += `}\n`;
    }
    code += eachGuardClose;
  }

  return code;
}

/** buildRulesCode — orchestrator that composes categorize → resolve → emit phases */
function buildRulesCode(
  fieldKey: string,
  varName: string,
  validation: RawPropertyMeta['validation'],
  collectErrors: boolean,
  emitCtx: EmitContext,
  ctx: FieldCodeContext,
  meta?: RawPropertyMeta,
): string {
  // Phase 1: Categorize rules
  const categorized = categorizeRules(fieldKey, validation);

  // Phase 2: Resolve type gate
  const resolved = resolveTypeGate(fieldKey, categorized, meta, ctx);

  let code = '';

  // Phase 3: Emit typed or general rules
  const hasTypedDeps = !!categorized.typedDeps;
  if (hasTypedDeps || resolved.asserterInferredGate || resolved.typeHintGate) {
    // Other general rules (excluding the type asserter)
    const otherGeneral = resolved.typeAsserter
      ? categorized.generalRules.filter((_, i) => i !== resolved.typeAsserterIdx)
      : categorized.generalRules;

    // Generate type gate condition — date uses instanceof, others use typeof
    let gateCondition: string;
    let gateErrorCode: string;

    if (resolved.typeAsserter) {
      gateErrorCode = resolved.typeAsserter.rule.ruleName;
    } else if (resolved.gateDeps.length > 0) {
      gateErrorCode = resolved.gateDeps[0]!.rule.ruleName;
    } else {
      gateErrorCode = 'conversionFailed'; // @Type hint only — no asserter or deps
    }

    if (resolved.effectiveGateType === 'date') {
      gateCondition = `!(${varName} instanceof Date)`;
    } else {
      gateCondition = `typeof ${varName} !== '${resolved.effectiveGateType}'`;
    }

    // 타입 게이트 fail — typeAsserter rd가 있으면 message/context 반영
    const gateEmitCtx = resolved.typeAsserter
      ? makeRuleEmitCtx(emitCtx, fieldKey, varName, resolved.typeAsserter, ctx)
      : emitCtx;

    code += emitTypedRules(fieldKey, varName, collectErrors, emitCtx, ctx, {
      effectiveGateType: resolved.effectiveGateType!,
      gateCondition,
      gateErrorCode,
      gateEmitCtx,
      otherGeneral,
      gateDeps: resolved.gateDeps,
      typeAsserter: resolved.typeAsserter,
      enableConversion: resolved.enableConversion,
    });
  } else {
    code += emitGeneralRules(fieldKey, varName, categorized.generalRules, collectErrors, emitCtx, ctx);
  }

  // Phase 4: Emit each rules
  code += emitEachRules(fieldKey, varName, categorized.each, collectErrors, emitCtx, ctx);

  return code;
}

// ─────────────────────────────────────────────────────────────────────────────
// generateNestedCode — @ValidateNested + @Type (§8.1, §8.2)
// ─────────────────────────────────────────────────────────────────────────────

function generateNestedCode(
  fieldKey: string,
  varName: string,
  meta: RawPropertyMeta,
  ctx: FieldCodeContext,
  emitCtx: EmitContext,
): string {
  const { collectErrors, execs } = ctx;

  if (!meta.type) return `${GEN.out}[${JSON.stringify(fieldKey)}] = ${varName};\n`;

  let code = '';
  const sk = sanitizeKey(fieldKey);

  if (meta.type.discriminator) {
    // §8.3 discriminator
    const discProp = JSON.stringify(meta.type.discriminator.property);
    code += `var ${GEN.disc}${sk} = ${varName} && ${varName}[${discProp}];\n`;
    code += `switch (${GEN.disc}${sk}) {\n`;
    for (const sub of meta.type.discriminator.subTypes) {
      const nestedSealed = (sub.value as any)[SEALED] as SealedExecutors<unknown> | undefined;
      const execIdx = execs.length;
      execs.push(nestedSealed as SealedExecutors<unknown>);
      const awaitKwD = ctx.isAsync ? 'await ' : '';
      code += `  case ${JSON.stringify(sub.name)}:\n`;
      code += `    var ${GEN.result}${sk} = ${awaitKwD}_execs[${execIdx}]._deserialize(${varName}, _opts);\n`;
      code += generateNestedResultCode(fieldKey, varName, `${GEN.result}${sk}`, collectErrors);
      code += `    break;\n`;
    }
    code += `  default: ${emitCtx.fail('invalidDiscriminator')};\n`;
    code += `}\n`;
    // keepDiscriminatorProperty: discriminator 프로퍼티를 결과 객체에 유지 (PB-3)
    if (meta.type.keepDiscriminatorProperty) {
      code += `if (${GEN.out}[${JSON.stringify(fieldKey)}] != null) ${GEN.out}[${JSON.stringify(fieldKey)}][${discProp}] = ${GEN.disc}${sk};\n`;
    }
  } else {
    // §8.1 simple nested or §8.2 each array
    const nestedCls = meta.type.resolvedClass ?? meta.type.fn() as Function;
    const nestedSealed = (nestedCls as any)[SEALED] as SealedExecutors<unknown> | undefined;
    const execIdx = execs.length;
    execs.push(nestedSealed as SealedExecutors<unknown>);

    // Check if validateNested each (array) — determined by flags.validateNestedEach or RuleDef.each
    const hasEach = meta.type?.isArray || meta.flags.validateNestedEach || meta.validation.some(rd => rd.each);

    if (hasEach) {
      const iVar = `${GEN.index}${sk}`;
      const awaitKwE = ctx.isAsync ? 'await ' : '';
      code += `if (Array.isArray(${varName})) {\n`;

      // Emit non-each array-level validation rules (e.g. @ArrayMinSize, @ArrayMaxSize)
      const nonEachRules = meta.validation.filter(rd => !rd.each);
      for (const rd of nonEachRules) {
        const ruleEmitCtx = makeRuleEmitCtx(emitCtx, fieldKey, varName, rd, ctx);
        const ruleEmit = rd.rule.emit(varName, ruleEmitCtx);
        code += `  ${ruleEmit}\n`;
      }

      code += `  var ${GEN.arr}${sk} = [];\n`;
      code += `  for (var ${iVar}=0; ${iVar}<${varName}.length; ${iVar}++) {\n`;
      code += `    var ${GEN.result}${sk} = ${awaitKwE}_execs[${execIdx}]._deserialize(${varName}[${iVar}], _opts);\n`;
      code += `    if (_isErr(${GEN.result}${sk})) {\n`;
      if (collectErrors) {
        code += `      var ${GEN.errors}${sk} = ${GEN.result}${sk}.data;\n`;
        code += `      for (var ${GEN.nestedIdx}${sk}=0; ${GEN.nestedIdx}${sk}<${GEN.errors}${sk}.length; ${GEN.nestedIdx}${sk}++) {\n`;
        code += `        ${GEN.errList}.push({path:${JSON.stringify(fieldKey)}+'['+${iVar}+'].'+${GEN.errors}${sk}[${GEN.nestedIdx}${sk}].path,code:${GEN.errors}${sk}[${GEN.nestedIdx}${sk}].code});\n`;
        code += `      }\n`;
      } else {
        code += `      var ${GEN.errors}${sk} = ${GEN.result}${sk}.data;\n`;
        code += `      return _err([{path:${JSON.stringify(fieldKey)}+'['+${iVar}+'].'+${GEN.errors}${sk}[0].path,code:${GEN.errors}${sk}[0].code}]);\n`;
      }
      code += `    } else { ${GEN.arr}${sk}.push(${GEN.result}${sk}); }\n`;
      code += `  }\n`;
      code += `  ${GEN.out}[${JSON.stringify(fieldKey)}] = ${GEN.arr}${sk};\n`;
      code += `} else { ${emitCtx.fail('isArray')}; }\n`;
    } else {
      const awaitKwS = ctx.isAsync ? 'await ' : '';
      code += `if (${varName} != null && typeof ${varName} === 'object') {\n`;
      code += `  var ${GEN.result}${sk} = ${awaitKwS}_execs[${execIdx}]._deserialize(${varName}, _opts);\n`;
      code += generateNestedResultCode(fieldKey, varName, `${GEN.result}${sk}`, collectErrors);
      code += `} else { ${emitCtx.fail('isObject')}; }\n`;
    }
  }

  return code;
}

function generateNestedResultCode(
  fieldKey: string,
  _varName: string,
  resultVar: string,
  collectErrors: boolean,
): string {
  const sk = sanitizeKey(fieldKey);
  if (collectErrors) {
    return `  if (_isErr(${resultVar})) {\n` +
      `    var ${GEN.errors}${sk} = ${resultVar}.data;\n` +
      `    for (var ${GEN.nestedIdx}${sk}=0; ${GEN.nestedIdx}${sk}<${GEN.errors}${sk}.length; ${GEN.nestedIdx}${sk}++) {\n` +
      `      ${GEN.errList}.push({path:${JSON.stringify(fieldKey + '.')}+${GEN.errors}${sk}[${GEN.nestedIdx}${sk}].path,code:${GEN.errors}${sk}[${GEN.nestedIdx}${sk}].code});\n` +
      `    }\n` +
      `  } else { ${GEN.out}[${JSON.stringify(fieldKey)}] = ${resultVar}; }\n`;
  } else {
    return `  if (_isErr(${resultVar})) {\n` +
      `    var ${GEN.errors}${sk} = ${resultVar}.data;\n` +
      `    return _err([{path:${JSON.stringify(fieldKey+'.')}+${GEN.errors}${sk}[0].path,code:${GEN.errors}${sk}[0].code}]);\n` +
      `  } else { ${GEN.out}[${JSON.stringify(fieldKey)}] = ${resultVar}; }\n`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// makeEmitCtx — 필드별 EmitContext 생성
// ─────────────────────────────────────────────────────────────────────────────

function makeEmitCtx(fieldKey: string, ctx: FieldCodeContext): EmitContext {
  const { collectErrors, regexes, refs, execs } = ctx;
  return {
    addRegex(re: RegExp): number {
      regexes.push(re);
      return regexes.length - 1;
    },
    addRef(fn: unknown): number {
      refs.push(fn);
      return refs.length - 1;
    },
    addExecutor(executor: SealedExecutors<unknown>): number {
      execs.push(executor);
      return execs.length - 1;
    },
    fail(code: string): string {
      if (collectErrors) {
        return `${GEN.errList}.push({path:${JSON.stringify(fieldKey)},code:${JSON.stringify(code)}})`;
      } else {
        return `return _err([{path:${JSON.stringify(fieldKey)},code:${JSON.stringify(code)}}])`;
      }
    },
    collectErrors,
  };
}
