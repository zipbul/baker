import { err as _resultErr, isErr as _resultIsErr } from '@zipbul/result';
import type { Result, ResultAsync } from '@zipbul/result';
import { SEALED } from '../symbols';
import type { RawClassMeta, RawPropertyMeta, EmitContext, EmittableRule, SealedExecutors, RuleDef } from '../types';
import type { SealOptions, RuntimeOptions } from '../interfaces';
import { SealError, type BakerError } from '../errors';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — 코드 생성 유틸
// ─────────────────────────────────────────────────────────────────────────────

/** key를 유효한 JS 식별자 접미사로 변환 (비알파벳 문자를 charCode로 인코딩하여 충돌 방지) */
function sanitizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_]/g, (ch) => `$${ch.charCodeAt(0)}$`);
}

/** 필드명을 안전한 JS 변수명으로 변환 (내부 변수 충돌 방지 prefix 포함) */
function toVarName(key: string): string {
  return '__bk$f_' + sanitizeKey(key);
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

/** 필드 expose groups 결정 (직렬화에 적용되는 @Expose) */
function getDeserializeExposeGroups(exposeStack: RawPropertyMeta['expose']): string[] | undefined {
  const desDef = exposeStack.find(e => !e.serializeOnly);
  return desDef?.groups;
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
  body += 'var __bk$out = new _Cls();\n';

  // 에러 배열 (collectErrors mode)
  if (collectErrors) {
    body += 'var __bk$errors = [];\n';
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
      body += `for (var __bk$k of Object.keys(input)) { if (!_refs[${allowedIdx}].has(__bk$k)) __bk$errors.push({path:__bk$k,code:'whitelistViolation'}); }\n`;
    } else {
      body += `for (var __bk$k of Object.keys(input)) { if (!_refs[${allowedIdx}].has(__bk$k)) return _err([{path:__bk$k,code:'whitelistViolation'}]); }\n`;
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
    body += 'var __bk$groups = _opts && _opts.groups;\n';
    body += 'var __bk$groupsSet = __bk$groups ? new Set(__bk$groups) : null;\n';
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
    body += 'if (__bk$errors.length) return _err(__bk$errors);\n';
  }
  body += 'return __bk$out;\n';

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
    if (!meta.exclude.serializeOnly) return ''; // deserializeOnly or both → skip deserialize
  }

  // Expose: check if this field is exposed to deserialize
  // If all @Expose entries are serializeOnly, skip field
  if (meta.expose.length > 0 && meta.expose.every(e => e.serializeOnly)) {
    return ''; // only serializeOnly exposures → not visible to deserialize
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
    extractCode = `var ${varName} = (${JSON.stringify(extractKey)} in input) ? input[${JSON.stringify(extractKey)}] : __bk$out[${JSON.stringify(fieldKey)}];\n`;
  } else {
    extractCode = `var ${varName} = input[${JSON.stringify(extractKey)}];\n`;
  }

  // groups check wrap (§4.5)
  let fieldStart = '';
  let fieldEnd = '';
  if (exposeGroups && exposeGroups.length > 0) {
    const groupsArr = JSON.stringify(exposeGroups);
    fieldStart = `if (__bk$groupsSet && ${groupsArr}.some(function(g){return __bk$groupsSet.has(g);})) {\n`;
    fieldEnd = '}\n';
  }

  // inner content (extract + optional guard + validation + assign)
  let innerCode = extractCode;

  // ② null/undefined 가드 — @IsOptional, @IsNullable, @IsDefined 조합 (§4.3, Phase5)
  const useOptionalGuard = meta.flags.isOptional && !meta.flags.isDefined;
  const isNullable = meta.flags.isNullable === true;

  const validationCode = generateValidationCode(fieldKey, varName, meta, ctx, emitCtx);
  const assignNull = `__bk$out[${JSON.stringify(fieldKey)}] = null;\n`;

  if (isNullable && useOptionalGuard) {
    // Case 4: @IsNullable + @IsOptional — null은 할당, undefined는 skip
    innerCode += `if (${varName} === null) { ${assignNull}}\n`;
    innerCode += `else if (${varName} !== undefined) {\n`;
    innerCode += validationCode;
    innerCode += '}\n';
  } else if (isNullable) {
    // Case 3: @IsNullable (+ optional @IsDefined — 동일 동작)
    innerCode += `if (${varName} === undefined) ${emitCtx.fail('isDefined')};\n`;
    innerCode += `else if (${varName} !== null) {\n`;
    innerCode += validationCode;
    innerCode += `} else { ${assignNull}}\n`;
  } else if (meta.flags.isDefined) {
    // @IsDefined — undefined만 거부, null/""/0 등은 후속 검증으로 통과
    innerCode += `if (${varName} === undefined) ${emitCtx.fail('isDefined')};\n`;
    innerCode += validationCode;
  } else if (useOptionalGuard) {
    // Case 2: @IsOptional — undefined/null 시 전체 skip
    innerCode += `if (${varName} !== undefined && ${varName} !== null) {\n`;
    innerCode += validationCode;
    innerCode += '}\n';
  } else {
    // Case 1: 플래그 없음 (기본) — undefined/null 거부
    innerCode += `if (${varName} === undefined || ${varName} === null) ${emitCtx.fail('isDefined')};\n`;
    innerCode += `else {\n`;
    innerCode += validationCode;
    innerCode += '}\n';
  }

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
      const isAsyncTransform = ctx.isAsync && (td.fn as any).constructor?.name === 'AsyncFunction';
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
    code += `__bk$out[${JSON.stringify(fieldKey)}] = ${varName};\n`;
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
        return `__bk$errors.push({path:${JSON.stringify(fieldKey)},code:${JSON.stringify(code)}${extra}})`;
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
  return `if (!__bk$groupsSet || ${groupsArr}.some(function(g){return __bk$groupsSet.has(g);})) {\n${code}\n}\n`;
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
    ? `__bk$errors.push({path:${JSON.stringify(fieldKey)},code:'conversionFailed'}); ${skipVar} = true;`
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
      return '';
  }
}

/** @Type() primitive builtin → target type mapping */
const PRIMITIVE_TYPE_HINTS: Record<string, string> = {
  Number: 'number', Boolean: 'boolean', String: 'string', Date: 'date',
};

// ─────────────────────────────────────────────────────────────────────────────
// buildRulesCode — 타입 가드 + 마커 패턴 (§4.3, §4.10)
// ─────────────────────────────────────────────────────────────────────────────

function buildRulesCode(
  fieldKey: string,
  varName: string,
  validation: RawPropertyMeta['validation'],
  collectErrors: boolean,
  emitCtx: EmitContext,
  ctx: FieldCodeContext,
  meta?: RawPropertyMeta,
): string {
  const each = validation.filter(rd => rd.each);
  const nonEach = validation.filter(rd => !rd.each);

  let code = '';

  // Separate by requiresType — 4-type gate support
  const stringDeps  = nonEach.filter(rd => rd.rule.requiresType === 'string');
  const numberDeps  = nonEach.filter(rd => rd.rule.requiresType === 'number');
  const booleanDeps = nonEach.filter(rd => rd.rule.requiresType === 'boolean');
  const dateDeps    = nonEach.filter(rd => rd.rule.requiresType === 'date');
  const generalRules = nonEach.filter(rd => !rd.rule.requiresType);

  // Mixed gate conflict detection
  const typedDeps = [
    { type: 'string' as const, deps: stringDeps },
    { type: 'number' as const, deps: numberDeps },
    { type: 'boolean' as const, deps: booleanDeps },
    { type: 'date' as const, deps: dateDeps },
  ].filter(d => d.deps.length > 0);
  if (typedDeps.length > 1) {
    throw new SealError(`Field "${fieldKey}" has conflicting requiresType: ${typedDeps.map(d => d.type).join(', ')}`);
  }

  // Asserter → gate mapping
  const ASSERTER_TO_GATE: Record<string, string> = {
    isString: 'string', isNumber: 'number', isBoolean: 'boolean', isDate: 'date', isInt: 'number',
  };
  const GATE_ONLY_ASSERTERS = new Set(['isString', 'isBoolean']);

  const hasTypedDeps = typedDeps.length > 0;
  const firstTyped = hasTypedDeps ? typedDeps[0] : undefined;
  const gateType = firstTyped?.type ?? null;
  const gateDeps = firstTyped?.deps ?? [];

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
    } catch { /* ignore lazy eval failures */ }
  }

  // Effective gate: typed deps > asserter inferred > @Type hint
  const effectiveGateType = gateType ?? asserterInferredGate ?? typeHintGate;

  if (hasTypedDeps || asserterInferredGate || typeHintGate) {
    // Other general rules (excluding the type asserter)
    const otherGeneral = typeAsserter
      ? generalRules.filter((_, i) => i !== typeAsserterIdx)
      : generalRules;

    // Generate type gate condition — date uses instanceof, others use typeof
    let gateCondition: string;
    let gateErrorCode: string;

    if (typeAsserter) {
      gateErrorCode = typeAsserter.rule.ruleName;
    } else if (gateDeps.length > 0) {
      gateErrorCode = gateDeps[0]!.rule.ruleName;
    } else {
      gateErrorCode = 'conversionFailed'; // @Type hint only — no asserter or deps
    }

    if (effectiveGateType === 'date') {
      gateCondition = `!(${varName} instanceof Date)`;
    } else {
      gateCondition = `typeof ${varName} !== '${effectiveGateType}'`;
    }

    // 타입 게이트 fail — typeAsserter rd가 있으면 message/context 반영
    const gateEmitCtx = typeAsserter
      ? makeRuleEmitCtx(emitCtx, fieldKey, varName, typeAsserter, ctx)
      : emitCtx;

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
        const skipVar = `__bk$skip_${sanitizeKey(fieldKey)}`;
        code += `var ${skipVar} = false;\n`;
        code += `if (${gateCondition}) {\n`;
        code += generateConversionCode(effectiveGateType!, varName, fieldKey, skipVar, true, emitCtx);
        code += `}\n`;
        code += `if (!${skipVar}) {\n`;
        const markVar = `__bk$mark_${sanitizeKey(fieldKey)}`;
        code += `  var ${markVar} = __bk$errors.length;\n`;
        code += emitInnerRules('  ');
        code += `  if (__bk$errors.length === ${markVar}) __bk$out[${JSON.stringify(fieldKey)}] = ${varName};\n`;
        code += `}\n`;
      } else {
        code += `if (${gateCondition}) ${gateEmitCtx.fail(gateErrorCode)};\n`;
        code += `else {\n`;
        const markVar = `__bk$mark_${sanitizeKey(fieldKey)}`;
        code += `  var ${markVar} = __bk$errors.length;\n`;
        code += emitInnerRules('  ');
        code += `  if (__bk$errors.length === ${markVar}) __bk$out[${JSON.stringify(fieldKey)}] = ${varName};\n`;
        code += `}\n`;
      }
    } else {
      if (enableConversion) {
        code += `if (${gateCondition}) {\n`;
        code += generateConversionCode(effectiveGateType!, varName, fieldKey, null, false, emitCtx);
        code += `}\n`;
        code += emitInnerRules('');
        code += `__bk$out[${JSON.stringify(fieldKey)}] = ${varName};\n`;
      } else {
        code += `if (${gateCondition}) ${gateEmitCtx.fail(gateErrorCode)};\n`;
        code += emitInnerRules('');
        code += `__bk$out[${JSON.stringify(fieldKey)}] = ${varName};\n`;
      }
    }
  } else {
    // No type-specific rules and no @Type hint — all general
    if (collectErrors) {
      if (generalRules.length === 0) {
        code += `__bk$out[${JSON.stringify(fieldKey)}] = ${varName};\n`;
      } else {
        const markVar = `__bk$mark_${sanitizeKey(fieldKey)}`;
        code += `var ${markVar} = __bk$errors.length;\n`;
        for (const rd of generalRules) {
          code += wrapGroupsGuard(rd, rd.rule.emit(varName, makeRuleEmitCtx(emitCtx, fieldKey, varName, rd, ctx))) + '\n';
        }
        code += `if (__bk$errors.length === ${markVar}) __bk$out[${JSON.stringify(fieldKey)}] = ${varName};\n`;
      }
    } else {
      for (const rd of generalRules) {
        code += wrapGroupsGuard(rd, rd.rule.emit(varName, makeRuleEmitCtx(emitCtx, fieldKey, varName, rd, ctx))) + '\n';
      }
      code += `__bk$out[${JSON.stringify(fieldKey)}] = ${varName};\n`;
    }
  }

  // each: true rules — Array + Set + Map 지원
  for (const rd of each) {
    const pathKey = JSON.stringify(fieldKey);
    const iVar = `__bk$i_${sanitizeKey(fieldKey)}`;
    const siVar = `__bk$si_${sanitizeKey(fieldKey)}`;
    const svVar = `__bk$sv_${sanitizeKey(fieldKey)}`;
    const miVar = `__bk$mi_${sanitizeKey(fieldKey)}`;
    const mvVar = `__bk$mv_${sanitizeKey(fieldKey)}`;
    const extra = computeRuleExtras(rd, fieldKey, varName, ctx);
    const eachGuardOpen = (rd.groups && rd.groups.length > 0)
      ? `if (!__bk$groupsSet || ${JSON.stringify(rd.groups)}.some(function(g){return __bk$groupsSet.has(g);})) {\n`
      : '';
    const eachGuardClose = (rd.groups && rd.groups.length > 0) ? '}\n' : '';

    if (collectErrors) {
      const arrFail = (c: string) => `__bk$errors.push({path:${pathKey}+'['+${iVar}+']',code:${JSON.stringify(c)}${extra}})`;
      const arrEmitCtx: EmitContext = { ...emitCtx, fail: arrFail };
      const setFail = (c: string) => `__bk$errors.push({path:${pathKey}+'['+${siVar}+']',code:${JSON.stringify(c)}${extra}})`;
      const setEmitCtx: EmitContext = { ...emitCtx, fail: setFail };
      const mapFail = (c: string) => `__bk$errors.push({path:${pathKey}+'['+${miVar}+']',code:${JSON.stringify(c)}${extra}})`;
      const mapEmitCtx: EmitContext = { ...emitCtx, fail: mapFail };

      code += eachGuardOpen;
      code += `if (Array.isArray(${varName})) {\n`;
      code += `  for (var ${iVar}=0; ${iVar}<${varName}.length; ${iVar}++) {\n`;
      code += '    ' + rd.rule.emit(`${varName}[${iVar}]`, arrEmitCtx) + '\n';
      code += `  }\n`;
      code += `} else if (${varName} instanceof Set) {\n`;
      code += `  var ${siVar} = 0;\n`;
      code += `  for (var ${svVar} of ${varName}) {\n`;
      code += '    ' + rd.rule.emit(svVar, setEmitCtx) + '\n';
      code += `    ${siVar}++;\n`;
      code += `  }\n`;
      code += `} else if (${varName} instanceof Map) {\n`;
      code += `  var ${miVar} = 0;\n`;
      code += `  for (var ${mvVar} of ${varName}.values()) {\n`;
      code += '    ' + rd.rule.emit(mvVar, mapEmitCtx) + '\n';
      code += `    ${miVar}++;\n`;
      code += `  }\n`;
      code += `} else { __bk$errors.push({path:${pathKey},code:'isArray'}); }\n`;
      code += eachGuardClose;
    } else {
      code += eachGuardOpen;
      code += `if (!Array.isArray(${varName}) && !(${varName} instanceof Set) && !(${varName} instanceof Map)) ${emitCtx.fail('isArray')};\n`;
      const arrFail2 = (c: string) => `return _err([{path:${pathKey}+'['+${iVar}+']',code:${JSON.stringify(c)}${extra}}])`;
      const arrEmitCtx2: EmitContext = { ...emitCtx, fail: arrFail2 };
      code += `if (Array.isArray(${varName})) {\n`;
      code += `  for (var ${iVar}=0; ${iVar}<${varName}.length; ${iVar}++) {\n`;
      code += '    ' + rd.rule.emit(`${varName}[${iVar}]`, arrEmitCtx2) + '\n';
      code += `  }\n`;
      code += `} else if (${varName} instanceof Set) {\n`;
      code += `  for (var ${svVar} of ${varName}) {\n`;
      const setFail2 = (c: string) => `return _err([{path:${pathKey},code:${JSON.stringify(c)}${extra}}])`;
      const setEmitCtx2: EmitContext = { ...emitCtx, fail: setFail2 };
      code += '    ' + rd.rule.emit(svVar, setEmitCtx2) + '\n';
      code += `  }\n`;
      code += `} else if (${varName} instanceof Map) {\n`;
      code += `  for (var ${mvVar} of ${varName}.values()) {\n`;
      const mapFail2 = (c: string) => `return _err([{path:${pathKey},code:${JSON.stringify(c)}${extra}}])`;
      const mapEmitCtx2: EmitContext = { ...emitCtx, fail: mapFail2 };
      code += '    ' + rd.rule.emit(mvVar, mapEmitCtx2) + '\n';
      code += `  }\n`;
      code += `}\n`;
      code += eachGuardClose;
    }
  }

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

  if (!meta.type) return `__bk$out[${JSON.stringify(fieldKey)}] = ${varName};\n`;

  let code = '';
  const sk = sanitizeKey(fieldKey);

  if (meta.type.discriminator) {
    // §8.3 discriminator
    const discProp = JSON.stringify(meta.type.discriminator.property);
    code += `var __bk$dt_${sk} = ${varName} && ${varName}[${discProp}];\n`;
    code += `switch (__bk$dt_${sk}) {\n`;
    for (const sub of meta.type.discriminator.subTypes) {
      const nestedSealed = (sub.value as any)[SEALED] as SealedExecutors<unknown> | undefined;
      const execIdx = execs.length;
      execs.push(nestedSealed as SealedExecutors<unknown>);
      const awaitKwD = ctx.isAsync ? 'await ' : '';
      code += `  case ${JSON.stringify(sub.name)}:\n`;
      code += `    var __bk$r_${sk} = ${awaitKwD}_execs[${execIdx}]._deserialize(${varName}, _opts);\n`;
      code += generateNestedResultCode(fieldKey, varName, `__bk$r_${sk}`, collectErrors);
      code += `    break;\n`;
    }
    code += `  default: ${emitCtx.fail('invalidDiscriminator')};\n`;
    code += `}\n`;
    // keepDiscriminatorProperty: discriminator 프로퍼티를 결과 객체에 유지 (PB-3)
    if (meta.type.keepDiscriminatorProperty) {
      code += `if (__bk$out[${JSON.stringify(fieldKey)}] != null) __bk$out[${JSON.stringify(fieldKey)}][${discProp}] = __bk$dt_${sk};\n`;
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
      const iVar = `__bk$i_${sk}`;
      const awaitKwE = ctx.isAsync ? 'await ' : '';
      code += `if (Array.isArray(${varName})) {\n`;

      // Emit non-each array-level validation rules (e.g. @ArrayMinSize, @ArrayMaxSize)
      const nonEachRules = meta.validation.filter(rd => !rd.each);
      for (const rd of nonEachRules) {
        const extra = computeRuleExtras(rd, fieldKey, varName, ctx);
        const ruleEmit = rd.rule.emit(varName, emitCtx);
        code += `  ${ruleEmit}\n`;
      }

      code += `  var __bk$arr_${sk} = [];\n`;
      code += `  for (var ${iVar}=0; ${iVar}<${varName}.length; ${iVar}++) {\n`;
      code += `    var __bk$r_${sk} = ${awaitKwE}_execs[${execIdx}]._deserialize(${varName}[${iVar}], _opts);\n`;
      code += `    if (_isErr(__bk$r_${sk})) {\n`;
      if (collectErrors) {
        code += `      var __bk$re_${sk} = __bk$r_${sk}.data;\n`;
        code += `      for (var __bk$j_${sk}=0; __bk$j_${sk}<__bk$re_${sk}.length; __bk$j_${sk}++) {\n`;
        code += `        __bk$errors.push({path:${JSON.stringify(fieldKey)}+'['+${iVar}+'].'+__bk$re_${sk}[__bk$j_${sk}].path,code:__bk$re_${sk}[__bk$j_${sk}].code});\n`;
        code += `      }\n`;
      } else {
        code += `      var __bk$re_${sk} = __bk$r_${sk}.data;\n`;
        code += `      return _err([{path:${JSON.stringify(fieldKey)}+'['+${iVar}+'].'+__bk$re_${sk}[0].path,code:__bk$re_${sk}[0].code}]);\n`;
      }
      code += `    } else { __bk$arr_${sk}.push(__bk$r_${sk}); }\n`;
      code += `  }\n`;
      code += `  __bk$out[${JSON.stringify(fieldKey)}] = __bk$arr_${sk};\n`;
      code += `} else { ${emitCtx.fail('isArray')}; }\n`;
    } else {
      const awaitKwS = ctx.isAsync ? 'await ' : '';
      code += `if (${varName} != null && typeof ${varName} === 'object') {\n`;
      code += `  var __bk$r_${sk} = ${awaitKwS}_execs[${execIdx}]._deserialize(${varName}, _opts);\n`;
      code += generateNestedResultCode(fieldKey, varName, `__bk$r_${sk}`, collectErrors);
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
      `    var __bk$re_${sk} = ${resultVar}.data;\n` +
      `    for (var __bk$j_${sk}=0; __bk$j_${sk}<__bk$re_${sk}.length; __bk$j_${sk}++) {\n` +
      `      __bk$errors.push({path:${JSON.stringify(fieldKey + '.')}+__bk$re_${sk}[__bk$j_${sk}].path,code:__bk$re_${sk}[__bk$j_${sk}].code});\n` +
      `    }\n` +
      `  } else { __bk$out[${JSON.stringify(fieldKey)}] = ${resultVar}; }\n`;
  } else {
    return `  if (_isErr(${resultVar})) {\n` +
      `    var __bk$re_${sk} = ${resultVar}.data;\n` +
      `    return _err([{path:${JSON.stringify(fieldKey+'.')}+__bk$re_${sk}[0].path,code:__bk$re_${sk}[0].code}]);\n` +
      `  } else { __bk$out[${JSON.stringify(fieldKey)}] = ${resultVar}; }\n`;
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
        return `__bk$errors.push({path:${JSON.stringify(fieldKey)},code:${JSON.stringify(code)}})`;
      } else {
        return `return _err([{path:${JSON.stringify(fieldKey)},code:${JSON.stringify(code)}}])`;
      }
    },
    collectErrors,
  };
}
