import { err as _resultErr, isErr as _resultIsErr } from '@zipbul/result';
import type { Result, ResultAsync } from '@zipbul/result';
import { SEALED } from '../symbols';
import type { RawClassMeta, RawPropertyMeta, EmitContext, EmittableRule, SealedExecutors, RuleDef } from '../types';
import type { SealOptions, RuntimeOptions } from '../interfaces';
import { SealError, type BakerError } from '../errors';
import { emitRulePlan } from '../rule-plan';
import { sanitizeKey, buildGroupsHasExpr } from './codegen-utils';

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
  group0: '__bk$group0',
  groupsSet: '__bk$groupsSet',
  key: '__bk$k',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — code generation utilities
// ─────────────────────────────────────────────────────────────────────────────


/** Generate nested error push code that propagates message/context fields */
function nestedErrPush(errList: string, pathExpr: string, errItemExpr: string, tmpVar: string): string {
  return `if(${errItemExpr}.message===undefined&&${errItemExpr}.context===undefined){${errList}.push({path:${pathExpr},code:${errItemExpr}.code});}\n` +
    `      else{var ${tmpVar}={path:${pathExpr},code:${errItemExpr}.code};\n` +
    `      if(${errItemExpr}.message!==undefined)${tmpVar}.message=${errItemExpr}.message;\n` +
    `      if(${errItemExpr}.context!==undefined)${tmpVar}.context=${errItemExpr}.context;\n` +
    `      ${errList}.push(${tmpVar});}\n`;
}

/** Generate nested error return code that propagates message/context fields */
function nestedErrReturn(pathExpr: string, errItemExpr: string, tmpVar: string, validateOnly?: boolean): string {
  const ret = (arr: string) => validateOnly ? `return ${arr};\n` : `return _err(${arr});\n`;
  return `if(${errItemExpr}.message===undefined&&${errItemExpr}.context===undefined)${ret(`[{path:${pathExpr},code:${errItemExpr}.code}]`)}` +
    `    var ${tmpVar}={path:${pathExpr},code:${errItemExpr}.code};\n` +
    `    if(${errItemExpr}.message!==undefined)${tmpVar}.message=${errItemExpr}.message;\n` +
    `    if(${errItemExpr}.context!==undefined)${tmpVar}.context=${errItemExpr}.context;\n` +
    `    ${ret(`[${tmpVar}]`)}`;
}

/** Convert field name to a safe JS variable name (includes prefix to prevent internal variable collisions) */
function toVarName(key: string, prefix?: string): string {
  return GEN.field + (prefix || '') + sanitizeKey(key);
}

/** Determine the extraction key for deserialization (§4.3 step 3) */
function getDeserializeExtractKey(fieldKey: string, exposeStack: RawPropertyMeta['expose']): string {
  // deserializeOnly @Expose with name → use that name
  const desDef = exposeStack.find(e => e.deserializeOnly && e.name);
  if (desDef) return desDef.name!;
  // Non-directional @Expose with name → use for both directions
  const biDef = exposeStack.find(e => !e.deserializeOnly && !e.serializeOnly && e.name);
  if (biDef) return biDef.name!;
  return fieldKey;
}

/** Determine field expose groups — returns undefined (no restriction) if any unconditional expose entry exists */
function getDeserializeExposeGroups(exposeStack: RawPropertyMeta['expose']): string[] | undefined {
  const desEntries = exposeStack.filter(e => !e.serializeOnly);
  if (desEntries.length === 0) return undefined;
  // If any entry has no group restriction, always expose
  if (desEntries.some(e => !e.groups || e.groups.length === 0)) return undefined;
  // Merge groups from all entries
  const all = new Set<string>();
  for (const e of desEntries) for (const g of e.groups!) all.add(g);
  return [...all];
}

// ─────────────────────────────────────────────────────────────────────────────
// buildDeserializeCode — new Function-based executor generation (§4.9)
// ─────────────────────────────────────────────────────────────────────────────

export function buildDeserializeCode<T>(
  Class: Function,
  merged: RawClassMeta,
  options: SealOptions | undefined,
  needsCircularCheck: boolean,
  isAsync: boolean,
  validateOnly = false,
): (input: unknown, opts?: RuntimeOptions) => Result<T, BakerError[]> | ResultAsync<T, BakerError[]> {
  const stopAtFirstError = options?.stopAtFirstError ?? false;
  const collectErrors = !stopAtFirstError;
  const exposeDefaultValues = options?.exposeDefaultValues ?? false;

  // Reference arrays — injected into new Function closure
  const regexes: RegExp[] = [];
  const refs: unknown[] = [];
  const execs: SealedExecutors<unknown>[] = [];

  // ── Code generation ────────────────────────────────────────────────────────

  // Helper: wrap error array return — validate mode returns raw array, deserialize mode wraps in Result.err
  const wrapErr = validateOnly ? (inner: string) => inner : (inner: string) => `_err(${inner})`;

  let body = '\'use strict\';\n';

  // Create instance — skip in validate mode (no object creation needed)
  if (validateOnly) {
    if (exposeDefaultValues) body += 'var __bk$defs = new _Cls();\n';
  } else {
    body += exposeDefaultValues
      ? `var ${GEN.out} = new _Cls();\n`
      : `var ${GEN.out} = Object.create(_Cls.prototype);\n`;
  }

  // Error array (collectErrors mode)
  if (collectErrors) {
    body += `var ${GEN.errList} = [];\n`;
  }

  // preamble: input type guard (§4.9)
  body += `if (input == null || typeof input !== 'object' || Array.isArray(input)) return ${wrapErr('[{path:\'\',code:\'invalidInput\'}]')};\n`;

  // WeakSet guard (circular references) — try/finally ensures cleanup between calls
  let circularWsIdx = -1;
  if (needsCircularCheck) {
    refs.push(new WeakSet());
    circularWsIdx = refs.length - 1;
    body += `if (_refs[${circularWsIdx}].has(input)) return ${wrapErr("[{path:'',code:'circular'}]")};\n`;
    body += `_refs[${circularWsIdx}].add(input);\n`;
    body += `try {\n`;
  }

  // Whitelist check (§7.2) — reject undeclared fields
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
      body += `for (var ${GEN.key} of Object.keys(input)) { if (!_refs[${allowedIdx}].has(${GEN.key})) return ${wrapErr(`[{path:${GEN.key},code:'whitelistViolation'}]`)}; }\n`;
    }
  }

  // Groups variable — only when expose groups or validation rule groups exist (§4.9, §M4)
  const hasGroupsField = Object.values(merged).some(meta => {
    const exposeGroups = getDeserializeExposeGroups(meta.expose);
    if (exposeGroups && exposeGroups.length > 0) return true;
    if (meta.validation.some(rd => rd.groups && rd.groups.length > 0)) return true;
    return false;
  });
  if (hasGroupsField) {
    body += `var ${GEN.groups} = _opts && _opts.groups;\n`;
    body += `var ${GEN.group0} = ${GEN.groups} && ${GEN.groups}.length === 1 ? ${GEN.groups}[0] : null;\n`;
    body += `var ${GEN.groupsSet} = ${GEN.groups} && ${GEN.groups}.length > 1 ? new Set(${GEN.groups}) : null;\n`;
  }

  // ── Per-field code generation ──────────────────────────────────────────────

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
      validateOnly,
    });
    body += fieldCode;
  }

  // ── epilogue ──────────────────────────────────────────────────────────────

  if (collectErrors) {
    body += `if (${GEN.errList}.length) return ${validateOnly ? GEN.errList : `_err(${GEN.errList})`};\n`;
  }
  body += `return ${validateOnly ? 'null' : GEN.out};\n`;

  // Close try/finally for circular reference WeakSet cleanup
  if (needsCircularCheck) {
    body += `} finally { _refs[${circularWsIdx}].delete(input); }\n`;
  }

  // sourceURL (§4.9)
  body += `//# sourceURL=baker://${Class.name}/${validateOnly ? 'validate' : 'deserialize'}\n`;

  // ── Execute new Function ───────────────────────────────────────────────────

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
// buildValidateCode — validate-only executor (no Object.create, no assignments)
// ─────────────────────────────────────────────────────────────────────────────

export function buildValidateCode(
  Class: Function,
  merged: RawClassMeta,
  options: SealOptions | undefined,
  needsCircularCheck: boolean,
  isAsync: boolean,
): (input: unknown, opts?: RuntimeOptions) => BakerError[] | null | Promise<BakerError[] | null> {
  return buildDeserializeCode(Class, merged, options, needsCircularCheck, isAsync, true) as any;
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
  // Case 4: @IsNullable + @IsOptional — assign null, skip undefined
  'nullable+optional'({ varName, assignNull, validationCode }) {
    let code = `if (${varName} === null) { ${assignNull}}\n`;
    code += `else if (${varName} !== undefined) {\n`;
    code += validationCode;
    code += '}\n';
    return code;
  },
  // Case 3: @IsNullable (+ optional @IsDefined — same behavior)
  'nullable'({ varName, emitCtx, assignNull, validationCode }) {
    let code = `if (${varName} === undefined) ${emitCtx.fail('isDefined')};\n`;
    code += `else if (${varName} !== null) {\n`;
    code += validationCode;
    code += `} else { ${assignNull}}\n`;
    return code;
  },
  // @IsDefined — reject only undefined, null/""/0 etc. pass through to subsequent validation
  'defined'({ varName, emitCtx, validationCode }) {
    let code = `if (${varName} === undefined) ${emitCtx.fail('isDefined')};\n`;
    code += validationCode;
    return code;
  },
  // Case 2: @IsOptional — skip entirely on undefined/null
  'optional'({ varName, validationCode }) {
    let code = `if (${varName} !== undefined && ${varName} !== null) {\n`;
    code += validationCode;
    code += '}\n';
    return code;
  },
  // Case 1: No flags (default) — reject undefined/null
  'default'({ varName, emitCtx, validationCode }) {
    let code = `if (${varName} === undefined || ${varName} === null) ${emitCtx.fail('isDefined')};\n`;
    code += `else {\n`;
    code += validationCode;
    code += '}\n';
    return code;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Field code generation
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
  validateOnly: boolean;
  /** Track classes being inlined to detect circular references */
  inlineNestedClasses?: Set<Function>;
  /** JS expression for path prefix (inline nested context) */
  pathPrefix?: string;
  /** Prefix for generated variable names (inline nested context) */
  varPrefix?: string;
  /** Input object expression — 'input' by default, custom for inline nested */
  inputExpr?: string;
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

  const varName = toVarName(fieldKey, ctx.varPrefix);
  const extractKey = getDeserializeExtractKey(fieldKey, meta.expose);
  const exposeGroups = getDeserializeExposeGroups(meta.expose);
  const inputObj = ctx.inputExpr || 'input';

  // Create EmitContext
  const emitCtx = makeEmitCtx(fieldKey, ctx);

  let fieldCode = '';

  // ① @ValidateIf guard
  let validateIfIdx: number | null = null;
  if (meta.flags.validateIf) {
    validateIfIdx = ctx.refs.length;
    ctx.refs.push(meta.flags.validateIf);
  }

  // ③ Extract + exposeDefaultValues
  let extractCode: string;
  if (exposeDefaultValues && !meta.flags.isOptional) {
    // Use default value if key is not in input
    const defaultsSource = ctx.validateOnly ? '__bk$defs' : GEN.out;
    extractCode = `var ${varName} = (${JSON.stringify(extractKey)} in ${inputObj}) ? ${inputObj}[${JSON.stringify(extractKey)}] : ${defaultsSource}[${JSON.stringify(fieldKey)}];\n`;
  } else {
    extractCode = `var ${varName} = ${inputObj}[${JSON.stringify(extractKey)}];\n`;
  }

  // groups check wrap (§4.5)
  let fieldStart = '';
  let fieldEnd = '';
  if (exposeGroups && exposeGroups.length > 0) {
    fieldStart = `if ((${GEN.group0} !== null || ${GEN.groupsSet}) && (${buildGroupsHasExpr(GEN.group0, GEN.groupsSet, exposeGroups)})) {\n`;
    fieldEnd = '}\n';
  }

  // inner content (extract + optional guard + validation + assign)
  let innerCode = extractCode;

  // ② null/undefined guard — @IsOptional, @IsNullable, @IsDefined combinations (§4.3, Phase5)
  const useOptionalGuard = !!(meta.flags.isOptional && !meta.flags.isDefined);
  const isNullable = meta.flags.isNullable === true;

  const validationCode = generateValidationCode(fieldKey, varName, meta, ctx, emitCtx, exposeGroups);
  const assignNull = ctx.validateOnly ? '' : `${GEN.out}[${JSON.stringify(fieldKey)}] = null;\n`;

  const guardKey = resolveGuardKey(isNullable, useOptionalGuard, meta.flags.isDefined ?? false);
  innerCode += GUARD_STRATEGIES[guardKey]({ varName, emitCtx, assignNull, validationCode });

  // ① @ValidateIf outer wrap
  if (validateIfIdx !== null) {
    fieldCode += fieldStart + `if (_refs[${validateIfIdx}](${inputObj})) {\n` + innerCode + '}\n' + fieldEnd;
  } else {
    fieldCode += fieldStart + innerCode + fieldEnd;
  }

  return fieldCode;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation code generation — type guard + transform + validate + assign
// ─────────────────────────────────────────────────────────────────────────────

function generateValidationCode(
  fieldKey: string,
  varName: string,
  meta: RawPropertyMeta,
  ctx: FieldCodeContext,
  emitCtx: EmitContext,
  fieldGroups?: string[],
): string {
  const { collectErrors, execs } = ctx;

  let code = '';

  // @Transform (deserialize direction) — before validation (§4.3 ⑤)
  const dsTransforms = meta.transform.filter(
    td => !td.options?.serializeOnly,
  );
  if (dsTransforms.length > 0) {
    if (dsTransforms.length === 1) {
      const td = dsTransforms[0]!;
      const refIdx = ctx.refs.length;
      ctx.refs.push(td.fn);
      const callExpr = `_refs[${refIdx}]({value:${varName},key:${JSON.stringify(fieldKey)},obj:${ctx.inputExpr || 'input'}})`;
      code += `${varName} = ${td.isAsync ? 'await ' : ''}${callExpr};\n`;
    } else if (dsTransforms.length === 2) {
      const td0 = dsTransforms[0]!;
      const td1 = dsTransforms[1]!;
      const refIdx0 = ctx.refs.length;
      ctx.refs.push(td0.fn);
      const refIdx1 = ctx.refs.length;
      ctx.refs.push(td1.fn);
      const call0 = `_refs[${refIdx0}]({value:${varName},key:${JSON.stringify(fieldKey)},obj:${ctx.inputExpr || 'input'}})`;
      const expr0 = td0.isAsync ? `await ${call0}` : call0;
      const call1 = `_refs[${refIdx1}]({value:${expr0},key:${JSON.stringify(fieldKey)},obj:${ctx.inputExpr || 'input'}})`;
      code += `${varName} = ${td1.isAsync ? 'await ' : ''}${call1};\n`;
    } else {
      for (const td of dsTransforms) {
        const refIdx = ctx.refs.length;
        ctx.refs.push(td.fn);
        const callExpr = `_refs[${refIdx}]({value:${varName},key:${JSON.stringify(fieldKey)},obj:${ctx.inputExpr || 'input'}})`;
        code += `${varName} = ${td.isAsync ? 'await ' : ''}${callExpr};\n`;
      }
    }
  }

  // Collection (Map/Set) auto conversion
  if (meta.type?.collection) {
    code += ctx.validateOnly
      ? generateCollectionCodeValidateOnly(fieldKey, varName, meta, ctx, emitCtx)
      : generateCollectionCode(fieldKey, varName, meta, ctx, emitCtx);
    return code;
  }

  // @ValidateNested + @Type (§8.1)
  if (meta.flags.validateNested && meta.type?.fn) {
    code += ctx.validateOnly
      ? generateNestedCodeValidateOnly(fieldKey, varName, meta, ctx, emitCtx)
      : generateNestedCode(fieldKey, varName, meta, ctx, emitCtx);
    return code;
  }

  // No validation rules → direct assign (skip in validate mode)
  if (meta.validation.length === 0) {
    if (!ctx.validateOnly) code += `${GEN.out}[${JSON.stringify(fieldKey)}] = ${varName};\n`;
    return code;
  }

  // Build validation with type gate
  code += buildRulesCode(fieldKey, varName, meta.validation, collectErrors, emitCtx, ctx, meta, fieldGroups);

  return code;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper for computing per-rule extra fields (message/context) code strings
// ─────────────────────────────────────────────────────────────────────────────

/** Convert rule's message/context options into extra field strings within generated code */
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

/** Create per-rule EmitContext (with message/context overrides) */
function makeRuleEmitCtx(
  baseEmitCtx: EmitContext,
  fieldKey: string,
  varName: string,
  rd: RuleDef,
  ctx: FieldCodeContext,
): EmitContext {
  const extra = computeRuleExtras(rd, fieldKey, varName, ctx);
  if (!extra) return baseEmitCtx;
  const pathExpr = baseEmitCtx._pathExpr ?? JSON.stringify(fieldKey);
  return {
    ...baseEmitCtx,
    fail(code: string): string {
      if (baseEmitCtx.collectErrors) {
        return `${GEN.errList}.push({path:${pathExpr},code:${JSON.stringify(code)}${extra}})`;
      } else if (ctx.validateOnly) {
        return `return [{path:${pathExpr},code:${JSON.stringify(code)}${extra}}]`;
      } else {
        return `return _err([{path:${pathExpr},code:${JSON.stringify(code)}${extra}}])`;
      }
    },
  };
}

function emitRuleList(
  fieldKey: string,
  varName: string,
  rules: RuleDef[],
  emitCtx: EmitContext,
  ctx: FieldCodeContext,
  indent: string,
  fieldGroups?: string[],
  insideTypeGate?: boolean,
): string {
  let code = '';
  const cacheable = rules.filter(rd => sameGroups(rd.groups, fieldGroups));
  const lengthCount = cacheable.filter(rd => rd.rule.plan?.cacheKey === 'length').length;
  const timeCount = cacheable.filter(rd => rd.rule.plan?.cacheKey === 'time').length;
  const lengthVar = lengthCount > 1 ? `${GEN.arr}${sanitizeKey(fieldKey)}_len` : null;
  const timeVar = timeCount > 1 ? `${GEN.arr}${sanitizeKey(fieldKey)}_time` : null;

  if (lengthVar) code += `${indent}var ${lengthVar} = ${varName}.length;\n`;
  if (timeVar) code += `${indent}var ${timeVar} = ${varName}.getTime();\n`;

  for (const rd of rules) {
    const ruleEmitCtx = makeRuleEmitCtx(emitCtx, fieldKey, varName, rd, ctx);
    const gatedCtx = insideTypeGate ? { ...ruleEmitCtx, insideTypeGate: true } : ruleEmitCtx;
    const emitted =
      sameGroups(rd.groups, fieldGroups) && rd.rule.plan && (lengthVar || timeVar)
        ? emitRulePlan(varName, gatedCtx, rd.rule.ruleName, rd.rule.plan, {
            length: rd.rule.plan.cacheKey === 'length' ? lengthVar ?? undefined : undefined,
            time: rd.rule.plan.cacheKey === 'time' ? timeVar ?? undefined : undefined,
          }, insideTypeGate)
        : rd.rule.emit(varName, gatedCtx);
    if (!emitted) continue; // empty emit (e.g., asserter fully subsumed by gate)
    const ruleCode = sameGroups(rd.groups, fieldGroups) ? emitted : wrapGroupsGuard(rd, emitted);
    code += indent + ruleCode.replace(/\n/g, '\n' + indent) + '\n';
  }

  return code;
}

// ─────────────────────────────────────────────────────────────────────────────
// wrapGroupsGuard — per-rule validation groups check wrapper (§M4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * When rd.groups is set, only execute code if there is an intersection with runtime __bk$groups.
 * Rules without groups always execute (preserves existing behavior).
 */
function wrapGroupsGuard(rd: RuleDef, code: string): string {
  if (!rd.groups || rd.groups.length === 0) return code;
  return `if ((${GEN.group0} === null && !${GEN.groupsSet}) || ${buildGroupsHasExpr(GEN.group0, GEN.groupsSet, rd.groups)}) {\n${code}\n}\n`;
}

function sameGroups(a?: string[], b?: string[]): boolean {
  if (!a || a.length === 0) return !b || b.length === 0;
  if (!b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// generateConversionCode — enableImplicitConversion conversion code generation
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
    ? `${emitCtx.fail('conversionFailed')}; ${skipVar} = true;`
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
  isArray: 'array', isObject: 'object',
};

/** Asserters whose gate check fully subsumes the rule (skip emit inside gate) */
const GATE_ONLY_ASSERTERS = new Set(['isString', 'isBoolean', 'isDate', 'isArray', 'isObject']);

// ─────────────────────────────────────────────────────────────────────────────
// buildRulesCode — type guard + marker pattern (§4.3, §4.10)
// Decomposed into: categorizeRules → resolveTypeGate → emitTypedRules / emitGeneralRules / emitEachRules
// ─────────────────────────────────────────────────────────────────────────────

/** Result of categorizeRules — each/nonEach split and typed dependency classification */
interface CategorizedRules {
  each: RuleDef[];
  generalRules: RuleDef[];
  /** The single typed dependency group (if any) after conflict check */
  typedDeps: { type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object'; deps: RuleDef[] } | undefined;
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
  const arrayDeps   = nonEach.filter(rd => rd.rule.requiresType === 'array');
  const objectDeps  = nonEach.filter(rd => rd.rule.requiresType === 'object');
  const generalRules = nonEach.filter(rd => !rd.rule.requiresType);

  // Mixed gate conflict detection
  const allTyped = [
    { type: 'string' as const, deps: stringDeps },
    { type: 'number' as const, deps: numberDeps },
    { type: 'boolean' as const, deps: booleanDeps },
    { type: 'date' as const, deps: dateDeps },
    { type: 'array' as const, deps: arrayDeps },
    { type: 'object' as const, deps: objectDeps },
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

  // enableImplicitConversion: asserter-only gate inference — generate conversion gate even for standalone @IsNumber() usage
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
  fieldGroups?: string[],
): string {
  let code = '';

  const { effectiveGateType, gateCondition, gateErrorCode, gateEmitCtx, otherGeneral, gateDeps, typeAsserter, enableConversion } = config;

  // Helper: emit inner validation rules
  const emitInnerRules = (indent: string): string => {
    const rules: RuleDef[] = [];
    // typeAsserter emit — skip GATE_ONLY_ASSERTERS (isString, isBoolean) as they fully overlap with the gate
    if (typeAsserter && !GATE_ONLY_ASSERTERS.has(typeAsserter.rule.ruleName)) {
      rules.push(typeAsserter);
    }
    rules.push(...otherGeneral, ...gateDeps);
    return emitRuleList(fieldKey, varName, rules, emitCtx, ctx, indent, fieldGroups, true);
  };

  if (collectErrors) {
    const canConvert = enableConversion && (
      effectiveGateType === 'string' ||
      effectiveGateType === 'number' ||
      effectiveGateType === 'boolean' ||
      effectiveGateType === 'date'
    );

    if (canConvert) {
      // Conversion mode: try convert on gate failure, skip field if conversion fails
      const skipVar = `${GEN.skip}${sanitizeKey(fieldKey)}`;
      code += `var ${skipVar} = false;\n`;
      code += `if (${gateCondition}) {\n`;
      code += generateConversionCode(effectiveGateType, varName, fieldKey, skipVar, true, emitCtx);
      code += `}\n`;
      code += `if (!${skipVar}) {\n`;
      if (ctx.validateOnly) {
        code += emitInnerRules('  ');
      } else {
        const markVar = `${GEN.mark}${sanitizeKey(fieldKey)}`;
        code += `  var ${markVar} = ${GEN.errList}.length;\n`;
        code += emitInnerRules('  ');
        code += `  if (${GEN.errList}.length === ${markVar}) ${GEN.out}[${JSON.stringify(fieldKey)}] = ${varName};\n`;
      }
      code += `}\n`;
    } else {
      code += `if (${gateCondition}) ${gateEmitCtx.fail(gateErrorCode)};\n`;
      code += `else {\n`;
      if (ctx.validateOnly) {
        code += emitInnerRules('  ');
      } else {
        const markVar = `${GEN.mark}${sanitizeKey(fieldKey)}`;
        code += `  var ${markVar} = ${GEN.errList}.length;\n`;
        code += emitInnerRules('  ');
        code += `  if (${GEN.errList}.length === ${markVar}) ${GEN.out}[${JSON.stringify(fieldKey)}] = ${varName};\n`;
      }
      code += `}\n`;
    }
  } else {
    const canConvert = enableConversion && (
      effectiveGateType === 'string' ||
      effectiveGateType === 'number' ||
      effectiveGateType === 'boolean' ||
      effectiveGateType === 'date'
    );

    if (canConvert) {
      code += `if (${gateCondition}) {\n`;
      code += generateConversionCode(effectiveGateType, varName, fieldKey, null, false, emitCtx);
      code += `}\n`;
      code += emitInnerRules('');
      if (!ctx.validateOnly) code += `${GEN.out}[${JSON.stringify(fieldKey)}] = ${varName};\n`;
    } else {
      code += `if (${gateCondition}) ${gateEmitCtx.fail(gateErrorCode)};\n`;
      code += emitInnerRules('');
      if (!ctx.validateOnly) code += `${GEN.out}[${JSON.stringify(fieldKey)}] = ${varName};\n`;
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
  fieldGroups?: string[],
): string {
  let code = '';

  if (collectErrors) {
    if (generalRules.length === 0) {
      if (!ctx.validateOnly) code += `${GEN.out}[${JSON.stringify(fieldKey)}] = ${varName};\n`;
    } else if (ctx.validateOnly) {
      code += emitRuleList(fieldKey, varName, generalRules, emitCtx, ctx, '', fieldGroups);
    } else {
      const markVar = `${GEN.mark}${sanitizeKey(fieldKey)}`;
      code += `var ${markVar} = ${GEN.errList}.length;\n`;
      code += emitRuleList(fieldKey, varName, generalRules, emitCtx, ctx, '', fieldGroups);
      code += `if (${GEN.errList}.length === ${markVar}) ${GEN.out}[${JSON.stringify(fieldKey)}] = ${varName};\n`;
    }
  } else {
    code += emitRuleList(fieldKey, varName, generalRules, emitCtx, ctx, '', fieldGroups);
    if (!ctx.validateOnly) code += `${GEN.out}[${JSON.stringify(fieldKey)}] = ${varName};\n`;
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
  fieldGroups?: string[],
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
    const eachGuardOpen = (rd.groups && rd.groups.length > 0 && !sameGroups(rd.groups, fieldGroups))
      ? `if ((${GEN.group0} === null && !${GEN.groupsSet}) || ${buildGroupsHasExpr(GEN.group0, GEN.groupsSet, rd.groups)}) {\n`
      : '';
    const eachGuardClose = (rd.groups && rd.groups.length > 0 && !sameGroups(rd.groups, fieldGroups)) ? '}\n' : '';

    // Collection descriptors: [idxVar, elemExpr, loopHeader, counterDecl, counterInc]
    const collections = [
      { guard: `Array.isArray(${varName})`, idxVar: iVar, elemExpr: `${varName}[${iVar}]`, loopHeader: `for (var ${iVar}=0; ${iVar}<${varName}.length; ${iVar}++)`, counterDecl: '', counterInc: '' },
      { guard: `${varName} instanceof Set`, idxVar: siVar, elemExpr: svVar, loopHeader: `for (var ${svVar} of ${varName})`, counterDecl: `var ${siVar} = 0;\n`, counterInc: `${siVar}++;\n` },
      { guard: `${varName} instanceof Map`, idxVar: miVar, elemExpr: mvVar, loopHeader: `for (var ${mvVar} of ${varName}.values())`, counterDecl: `var ${miVar} = 0;\n`, counterInc: `${miVar}++;\n` },
    ];

    const emitCollectionBlock = (col: typeof collections[number]): string => {
      const prefixVar = `__bk$ep_${sanitizeKey(col.idxVar)}`;
      const failFn = (c: string) => collectErrors
        ? `${GEN.errList}.push({path:${prefixVar}+${col.idxVar}+']',code:${JSON.stringify(c)}${extra}})`
        : ctx.validateOnly
          ? `return [{path:${prefixVar}+${col.idxVar}+']',code:${JSON.stringify(c)}${extra}}]`
          : `return _err([{path:${prefixVar}+${col.idxVar}+']',code:${JSON.stringify(c)}${extra}}])`;
      const colEmitCtx: EmitContext = { ...emitCtx, fail: failFn };
      let block = '';
      block += `  var ${prefixVar} = ${pathKey}+'[';\n`;
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
  fieldGroups?: string[],
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
      gateCondition = `!(${varName} instanceof Date) || isNaN(${varName}.getTime())`;
    } else if (resolved.effectiveGateType === 'array') {
      gateCondition = `!Array.isArray(${varName})`;
    } else if (resolved.effectiveGateType === 'object') {
      gateCondition = `typeof ${varName} !== 'object' || ${varName} === null || Array.isArray(${varName})`;
    } else if (resolved.effectiveGateType === 'number') {
      gateCondition = `typeof ${varName} !== 'number' || isNaN(${varName})`;
    } else {
      gateCondition = `typeof ${varName} !== '${resolved.effectiveGateType}'`;
    }

    // Type gate fail — reflect message/context if typeAsserter rd exists
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
    }, fieldGroups);
  } else {
    code += emitGeneralRules(fieldKey, varName, categorized.generalRules, collectErrors, emitCtx, ctx, fieldGroups);
  }

  // Phase 4: Emit each rules
  code += emitEachRules(fieldKey, varName, categorized.each, collectErrors, emitCtx, ctx, fieldGroups);

  return code;
}

// ─────────────────────────────────────────────────────────────────────────────
// generateCollectionCode — Map/Set auto conversion
// ─────────────────────────────────────────────────────────────────────────────

function generateCollectionCode(
  fieldKey: string,
  varName: string,
  meta: RawPropertyMeta,
  ctx: FieldCodeContext,
  emitCtx: EmitContext,
): string {
  const { collectErrors, execs } = ctx;
  const sk = sanitizeKey(fieldKey);
  const collection = meta.type!.collection!;
  const awaitKw = ctx.isAsync ? 'await ' : '';

  // nested DTO executor (if present)
  let execIdx = -1;
  if (meta.type!.resolvedCollectionValue) {
    const nestedSealed = (meta.type!.resolvedCollectionValue as any)[SEALED] as SealedExecutors<unknown>;
    execIdx = execs.length;
    execs.push(nestedSealed);
  }

  let code = '';

  if (collection === 'Set') {
    // input: array → Set
    code += `if (Array.isArray(${varName})) {\n`;

    // array-level validation rules (e.g. arrayMinSize)
      const nonEachRules = meta.validation.filter(rd => !rd.each);
      code += emitRuleList(fieldKey, varName, nonEachRules, emitCtx, ctx, '  ');

    if (execIdx >= 0) {
      // nested DTO Set
      const iVar = `${GEN.index}${sk}`;
      code += `  var ${GEN.arr}${sk} = new Set();\n`;
      code += `  for (var ${iVar}=0; ${iVar}<${varName}.length; ${iVar}++) {\n`;
      code += `    var ${GEN.result}${sk} = ${awaitKw}_execs[${execIdx}]._deserialize(${varName}[${iVar}], _opts);\n`;
      code += `    if (_isErr(${GEN.result}${sk})) {\n`;
      if (collectErrors) {
        code += `      var ${GEN.errors}${sk} = ${GEN.result}${sk}.data;\n`;
        code += `      var __bk$pp${sk} = ${JSON.stringify(fieldKey)}+'['+${iVar}+'].';\n`;
        code += `      for (var ${GEN.nestedIdx}${sk}=0; ${GEN.nestedIdx}${sk}<${GEN.errors}${sk}.length; ${GEN.nestedIdx}${sk}++) {\n`;
        code += `      ` + nestedErrPush(GEN.errList, `__bk$pp${sk}+${GEN.errors}${sk}[${GEN.nestedIdx}${sk}].path`, `${GEN.errors}${sk}[${GEN.nestedIdx}${sk}]`, `__ne${sk}`);
        code += `      }\n`;
      } else {
        code += `      var ${GEN.errors}${sk} = ${GEN.result}${sk}.data;\n`;
        code += `      var __bk$pp${sk} = ${JSON.stringify(fieldKey)}+'['+${iVar}+'].';\n`;
        code += `      ` + nestedErrReturn(`__bk$pp${sk}+${GEN.errors}${sk}[0].path`, `${GEN.errors}${sk}[0]`, `__ne${sk}`);
      }
      code += `    } else { ${GEN.arr}${sk}.add(${GEN.result}${sk}); }\n`;
      code += `  }\n`;
      code += `  ${GEN.out}[${JSON.stringify(fieldKey)}] = ${GEN.arr}${sk};\n`;
    } else {
      // primitive Set
      code += `  ${GEN.out}[${JSON.stringify(fieldKey)}] = new Set(${varName});\n`;
    }

    // each validation rules (per element)
    const eachRules = meta.validation.filter(rd => rd.each);
    if (eachRules.length > 0) {
      const siVar = `${GEN.setIdx}${sk}`;
      const svVar = `${GEN.setVal}${sk}`;
      code += `  var ${siVar} = 0;\n`;
      code += `  for (var ${svVar} of ${GEN.out}[${JSON.stringify(fieldKey)}]) {\n`;
      for (const rd of eachRules) {
        const failFn = (c: string) => collectErrors
          ? `${GEN.errList}.push({path:${JSON.stringify(fieldKey)}+'['+${siVar}+']',code:${JSON.stringify(c)}})`
          : `return _err([{path:${JSON.stringify(fieldKey)}+'['+${siVar}+']',code:${JSON.stringify(c)}}])`;
        const colEmitCtx: EmitContext = { ...emitCtx, fail: failFn };
        code += `    ${rd.rule.emit(svVar, colEmitCtx)}\n`;
      }
      code += `    ${siVar}++;\n`;
      code += `  }\n`;
    }

    code += `} else { ${emitCtx.fail('isArray')}; }\n`;
  } else {
    // Map: input plain object → Map
    code += `if (${varName} != null && typeof ${varName} === 'object' && !Array.isArray(${varName})) {\n`;

    if (execIdx >= 0) {
      // nested DTO Map
      const kVar = `${GEN.key}${sk}`;
      code += `  var ${GEN.arr}${sk} = new Map();\n`;
      code += `  for (var ${kVar} in ${varName}) {\n`;
      code += `    if (!Object.prototype.hasOwnProperty.call(${varName}, ${kVar})) continue;\n`;
      code += `    var ${GEN.result}${sk} = ${awaitKw}_execs[${execIdx}]._deserialize(${varName}[${kVar}], _opts);\n`;
      code += `    if (_isErr(${GEN.result}${sk})) {\n`;
      if (collectErrors) {
        code += `      var ${GEN.errors}${sk} = ${GEN.result}${sk}.data;\n`;
        code += `      var __bk$pp${sk} = ${JSON.stringify(fieldKey)}+'['+${kVar}+'].';\n`;
        code += `      for (var ${GEN.nestedIdx}${sk}=0; ${GEN.nestedIdx}${sk}<${GEN.errors}${sk}.length; ${GEN.nestedIdx}${sk}++) {\n`;
        code += `      ` + nestedErrPush(GEN.errList, `__bk$pp${sk}+${GEN.errors}${sk}[${GEN.nestedIdx}${sk}].path`, `${GEN.errors}${sk}[${GEN.nestedIdx}${sk}]`, `__ne${sk}`);
        code += `      }\n`;
      } else {
        code += `      var ${GEN.errors}${sk} = ${GEN.result}${sk}.data;\n`;
        code += `      var __bk$pp${sk} = ${JSON.stringify(fieldKey)}+'['+${kVar}+'].';\n`;
        code += `      ` + nestedErrReturn(`__bk$pp${sk}+${GEN.errors}${sk}[0].path`, `${GEN.errors}${sk}[0]`, `__ne${sk}`);
      }
      code += `    } else { ${GEN.arr}${sk}.set(${kVar}, ${GEN.result}${sk}); }\n`;
      code += `  }\n`;
      code += `  ${GEN.out}[${JSON.stringify(fieldKey)}] = ${GEN.arr}${sk};\n`;
    } else {
      // primitive Map
      code += `  var ${GEN.arr}${sk} = new Map();\n`;
      code += `  for (var ${GEN.key}${sk} in ${varName}) {\n`;
      code += `    if (Object.prototype.hasOwnProperty.call(${varName}, ${GEN.key}${sk})) ${GEN.arr}${sk}.set(${GEN.key}${sk}, ${varName}[${GEN.key}${sk}]);\n`;
      code += `  }\n`;
      code += `  ${GEN.out}[${JSON.stringify(fieldKey)}] = ${GEN.arr}${sk};\n`;
    }

    code += `} else { ${emitCtx.fail('isObject')}; }\n`;
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
      code += generateNestedResultCode(fieldKey, `${GEN.result}${sk}`, collectErrors);
      code += `    break;\n`;
    }
    code += `  default: ${emitCtx.fail('invalidDiscriminator')};\n`;
    code += `}\n`;
    // keepDiscriminatorProperty: preserve discriminator property in result object (PB-3)
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
      code += emitRuleList(fieldKey, varName, nonEachRules, emitCtx, ctx, '  ');

      code += `  var ${GEN.arr}${sk} = [];\n`;
      code += `  for (var ${iVar}=0; ${iVar}<${varName}.length; ${iVar}++) {\n`;
      code += `    var ${GEN.result}${sk} = ${awaitKwE}_execs[${execIdx}]._deserialize(${varName}[${iVar}], _opts);\n`;
      code += `    if (_isErr(${GEN.result}${sk})) {\n`;
      if (collectErrors) {
        code += `      var ${GEN.errors}${sk} = ${GEN.result}${sk}.data;\n`;
        code += `      var __bk$pp${sk} = ${JSON.stringify(fieldKey)}+'['+${iVar}+'].';\n`;
        code += `      for (var ${GEN.nestedIdx}${sk}=0; ${GEN.nestedIdx}${sk}<${GEN.errors}${sk}.length; ${GEN.nestedIdx}${sk}++) {\n`;
        code += `      ` + nestedErrPush(GEN.errList, `__bk$pp${sk}+${GEN.errors}${sk}[${GEN.nestedIdx}${sk}].path`, `${GEN.errors}${sk}[${GEN.nestedIdx}${sk}]`, `__ne${sk}`);
        code += `      }\n`;
      } else {
        code += `      var ${GEN.errors}${sk} = ${GEN.result}${sk}.data;\n`;
        code += `      var __bk$pp${sk} = ${JSON.stringify(fieldKey)}+'['+${iVar}+'].';\n`;
        code += `      ` + nestedErrReturn(`__bk$pp${sk}+${GEN.errors}${sk}[0].path`, `${GEN.errors}${sk}[0]`, `__ne${sk}`);
      }
      code += `    } else { ${GEN.arr}${sk}.push(${GEN.result}${sk}); }\n`;
      code += `  }\n`;
      code += `  ${GEN.out}[${JSON.stringify(fieldKey)}] = ${GEN.arr}${sk};\n`;
      code += `} else { ${emitCtx.fail('isArray')}; }\n`;
    } else {
      const awaitKwS = ctx.isAsync ? 'await ' : '';
      code += `if (${varName} != null && typeof ${varName} === 'object') {\n`;
      code += `  var ${GEN.result}${sk} = ${awaitKwS}_execs[${execIdx}]._deserialize(${varName}, _opts);\n`;
      code += generateNestedResultCode(fieldKey, `${GEN.result}${sk}`, collectErrors);
      code += `} else { ${emitCtx.fail('isObject')}; }\n`;
    }
  }

  return code;
}

function generateNestedResultCode(
  fieldKey: string,
  resultVar: string,
  collectErrors: boolean,
): string {
  const sk = sanitizeKey(fieldKey);
  if (collectErrors) {
    const errItem = `${GEN.errors}${sk}[${GEN.nestedIdx}${sk}]`;
    return `  if (_isErr(${resultVar})) {\n` +
      `    var ${GEN.errors}${sk} = ${resultVar}.data;\n` +
      `    var __bk$pp${sk} = ${JSON.stringify(fieldKey + '.')};\n` +
      `    for (var ${GEN.nestedIdx}${sk}=0; ${GEN.nestedIdx}${sk}<${GEN.errors}${sk}.length; ${GEN.nestedIdx}${sk}++) {\n` +
      `      ` + nestedErrPush(GEN.errList, `__bk$pp${sk}+${errItem}.path`, errItem, `__ne${sk}`) +
      `    }\n` +
      `  } else { ${GEN.out}[${JSON.stringify(fieldKey)}] = ${resultVar}; }\n`;
  } else {
    const errFirst = `${GEN.errors}${sk}[0]`;
    return `  if (_isErr(${resultVar})) {\n` +
      `    var ${GEN.errors}${sk} = ${resultVar}.data;\n` +
      `    var __bk$pp${sk} = ${JSON.stringify(fieldKey + '.')};\n` +
      `    ` + nestedErrReturn(`__bk$pp${sk}+${errFirst}.path`, errFirst, `__ne${sk}`) +
      `  } else { ${GEN.out}[${JSON.stringify(fieldKey)}] = ${resultVar}; }\n`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// generateNestedCodeValidateOnly — validate-only nested (inline when possible)
// ─────────────────────────────────────────────────────────────────────────────

/** Check if a nested DTO can be inlined (only circular references prevent inlining) */
function canInlineDto(_merged: RawClassMeta, cls: Function, inlinedSet: Set<Function>): boolean {
  if (inlinedSet.has(cls)) return false; // circular — only hard constraint
  return true;
}

/**
 * Emit inline validation code for all fields of a nested DTO.
 * Reuses generateFieldCode with modified ctx (pathPrefix, varPrefix, inputExpr).
 */
function emitInlineNestedBlock(
  nestedMerged: RawClassMeta,
  nestedClass: Function,
  inputExpr: string,
  pathPrefixExpr: string,
  varPrefix: string,
  ctx: FieldCodeContext,
): string {
  const inlinedSet = ctx.inlineNestedClasses!;
  inlinedSet.add(nestedClass);

  const inlineCtx: FieldCodeContext = {
    ...ctx,
    pathPrefix: pathPrefixExpr,
    varPrefix,
    inputExpr,
    exposeDefaultValues: false, // inline nested doesn't use exposeDefaultValues
  };

  let code = '';
  for (const [fieldKey, meta] of Object.entries(nestedMerged)) {
    code += generateFieldCode(fieldKey, meta, inlineCtx);
  }

  inlinedSet.delete(nestedClass);
  return code;
}

function generateNestedCodeValidateOnly(
  fieldKey: string,
  varName: string,
  meta: RawPropertyMeta,
  ctx: FieldCodeContext,
  emitCtx: EmitContext,
): string {
  const { collectErrors, execs } = ctx;
  if (!meta.type) return '';
  const sk = (ctx.varPrefix || '') + sanitizeKey(fieldKey);
  let code = '';

  // Initialize inline tracking set if not present
  if (!ctx.inlineNestedClasses) ctx.inlineNestedClasses = new Set();

  if (meta.type.discriminator) {
    // Discriminator — inline each subType's validation
    const discProp = JSON.stringify(meta.type.discriminator.property);
    code += `var ${GEN.disc}${sk} = ${varName} && ${varName}[${discProp}];\n`;
    code += `switch (${GEN.disc}${sk}) {\n`;
    for (const sub of meta.type.discriminator.subTypes) {
      const subSealed = (sub.value as any)[SEALED] as SealedExecutors<unknown>;
      const subMerged = subSealed._merged;
      const canInline = subMerged && canInlineDto(subMerged, sub.value, ctx.inlineNestedClasses);
      code += `  case ${JSON.stringify(sub.name)}:\n`;
      if (canInline) {
        const ppExpr = ctx.pathPrefix
          ? `${ctx.pathPrefix}+${JSON.stringify(fieldKey + '.')}`
          : JSON.stringify(fieldKey + '.');
        const vpPrefix = `${sk}_d${sanitizeKey(sub.name)}_`;
        code += emitInlineNestedBlock(subMerged!, sub.value, varName, ppExpr, vpPrefix, ctx);
      } else {
        const execIdx = execs.length;
        execs.push(subSealed);
        const awaitKw = ctx.isAsync ? 'await ' : '';
        code += `    var ${GEN.result}${sk} = ${awaitKw}_execs[${execIdx}]._validate(${varName}, _opts);\n`;
        code += generateValidateNestedResult(fieldKey, `${GEN.result}${sk}`, collectErrors);
      }
      code += `    break;\n`;
    }
    code += `  default: ${emitCtx.fail('invalidDiscriminator')};\n`;
    code += `}\n`;
  } else {
    const nestedCls = meta.type.resolvedClass ?? meta.type.fn() as Function;
    const nestedSealed = (nestedCls as any)[SEALED] as SealedExecutors<unknown>;
    const nestedMerged = nestedSealed._merged;
    const hasEach = meta.type?.isArray || meta.flags.validateNestedEach || meta.validation.some(rd => rd.each);

    // Decide: inline or function call
    const useInline = nestedMerged && canInlineDto(nestedMerged, nestedCls, ctx.inlineNestedClasses);

    if (hasEach) {
      const iVar = `${GEN.index}${sk}`;
      code += `if (Array.isArray(${varName})) {\n`;
      const nonEachRules = meta.validation.filter(rd => !rd.each);
      code += emitRuleList(fieldKey, varName, nonEachRules, emitCtx, ctx, '  ');

      code += `  for (var ${iVar}=0; ${iVar}<${varName}.length; ${iVar}++) {\n`;

      if (useInline) {
        // INLINE: generate validation code directly in the loop body
        const itemVar = `__il$${sk}_item`;
        const ppExpr = ctx.pathPrefix
          ? `${ctx.pathPrefix}+${JSON.stringify(fieldKey)}+'['+${iVar}+'].'`
          : `${JSON.stringify(fieldKey)}+'['+${iVar}+'].'`;
        const vpPrefix = `${sk}${iVar}_`;

        code += `    var ${itemVar} = ${varName}[${iVar}];\n`;
        // Input type guard for the item
        // invalidInput path must include trailing '.' to match deserialize error propagation
        // (deserialize generates pathPrefix + errItem.path where invalidInput has path='')
        const itemInvalidPathExpr = ctx.pathPrefix
          ? `${ctx.pathPrefix}+${JSON.stringify(fieldKey)}+'['+${iVar}+'].'`
          : `${JSON.stringify(fieldKey)}+'['+${iVar}+'].'`;
        code += `    if (${itemVar} == null || typeof ${itemVar} !== 'object' || Array.isArray(${itemVar})) `;
        if (collectErrors) {
          code += `${GEN.errList}.push({path:${itemInvalidPathExpr},code:'invalidInput'});\n`;
        } else {
          code += `return [{path:${itemInvalidPathExpr},code:'invalidInput'}];\n`;
        }
        code += `    else {\n`;
        code += emitInlineNestedBlock(nestedMerged!, nestedCls, itemVar, ppExpr, vpPrefix, ctx);
        code += `    }\n`;
      } else {
        // FALLBACK: function call to _validate
        const execIdx = execs.length;
        execs.push(nestedSealed);
        const awaitKw = ctx.isAsync ? 'await ' : '';
        code += `    var ${GEN.result}${sk} = ${awaitKw}_execs[${execIdx}]._validate(${varName}[${iVar}], _opts);\n`;
        code += `    if (${GEN.result}${sk} !== null) {\n`;
        const ppVar = `__bk$pp${sk}`;
        code += `      var ${ppVar} = ${JSON.stringify(fieldKey)}+'['+${iVar}+'].';\n`;
        if (collectErrors) {
          code += `      for (var ${GEN.nestedIdx}${sk}=0; ${GEN.nestedIdx}${sk}<${GEN.result}${sk}.length; ${GEN.nestedIdx}${sk}++) {\n`;
          code += `      ` + nestedErrPush(GEN.errList, `${ppVar}+${GEN.result}${sk}[${GEN.nestedIdx}${sk}].path`, `${GEN.result}${sk}[${GEN.nestedIdx}${sk}]`, `__ne${sk}`);
          code += `      }\n`;
        } else {
          code += `      ` + nestedErrReturn(`${ppVar}+${GEN.result}${sk}[0].path`, `${GEN.result}${sk}[0]`, `__ne${sk}`, true);
        }
        code += `    }\n`;
      }

      code += `  }\n`;
      code += `} else { ${emitCtx.fail('isArray')}; }\n`;
    } else {
      // Single nested object
      code += `if (${varName} != null && typeof ${varName} === 'object') {\n`;

      if (useInline) {
        const ppExpr = ctx.pathPrefix
          ? `${ctx.pathPrefix}+${JSON.stringify(fieldKey + '.')}`
          : JSON.stringify(fieldKey + '.');
        const vpPrefix = `${sk}_`;
        code += emitInlineNestedBlock(nestedMerged!, nestedCls, varName, ppExpr, vpPrefix, ctx);
      } else {
        const execIdx = execs.length;
        execs.push(nestedSealed);
        const awaitKw = ctx.isAsync ? 'await ' : '';
        code += `  var ${GEN.result}${sk} = ${awaitKw}_execs[${execIdx}]._validate(${varName}, _opts);\n`;
        code += generateValidateNestedResult(fieldKey, `${GEN.result}${sk}`, collectErrors);
      }

      code += `} else { ${emitCtx.fail('isObject')}; }\n`;
    }
  }
  return code;
}

/** Generate validate-mode nested result handling (null check instead of _isErr) */
function generateValidateNestedResult(
  fieldKey: string,
  resultVar: string,
  collectErrors: boolean,
): string {
  const sk = sanitizeKey(fieldKey);
  const ppVar = `__bk$pp${sk}`;
  if (collectErrors) {
    const errItem = `${resultVar}[${GEN.nestedIdx}${sk}]`;
    return `  if (${resultVar} !== null) {\n` +
      `    var ${ppVar} = ${JSON.stringify(fieldKey + '.')};\n` +
      `    for (var ${GEN.nestedIdx}${sk}=0; ${GEN.nestedIdx}${sk}<${resultVar}.length; ${GEN.nestedIdx}${sk}++) {\n` +
      `      ` + nestedErrPush(GEN.errList, `${ppVar}+${errItem}.path`, errItem, `__ne${sk}`) +
      `    }\n` +
      `  }\n`;
  } else {
    const errFirst = `${resultVar}[0]`;
    return `  if (${resultVar} !== null) {\n` +
      `    var ${ppVar} = ${JSON.stringify(fieldKey + '.')};\n` +
      `    ` + nestedErrReturn(`${ppVar}+${errFirst}.path`, errFirst, `__ne${sk}`, true) +
      `  }\n`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// generateCollectionCodeValidateOnly — validate-only collection (no Set/Map creation)
// ─────────────────────────────────────────────────────────────────────────────

function generateCollectionCodeValidateOnly(
  fieldKey: string,
  varName: string,
  meta: RawPropertyMeta,
  ctx: FieldCodeContext,
  emitCtx: EmitContext,
): string {
  const { collectErrors, execs } = ctx;
  const sk = (ctx.varPrefix || '') + sanitizeKey(fieldKey);
  const collection = meta.type!.collection!;
  const awaitKw = ctx.isAsync ? 'await ' : '';

  if (!ctx.inlineNestedClasses) ctx.inlineNestedClasses = new Set();

  // Resolve nested DTO for collection values
  let nestedCls: Function | undefined;
  let nestedSealed: SealedExecutors<unknown> | undefined;
  let nestedMerged: RawClassMeta | undefined;
  if (meta.type!.resolvedCollectionValue) {
    nestedCls = meta.type!.resolvedCollectionValue;
    nestedSealed = (nestedCls as any)[SEALED] as SealedExecutors<unknown>;
    nestedMerged = nestedSealed._merged;
  }
  const useInline = nestedCls && nestedMerged && canInlineDto(nestedMerged, nestedCls, ctx.inlineNestedClasses);

  let code = '';

  if (collection === 'Set') {
    code += `if (Array.isArray(${varName})) {\n`;
    const nonEachRules = meta.validation.filter(rd => !rd.each);
    code += emitRuleList(fieldKey, varName, nonEachRules, emitCtx, ctx, '  ');

    if (nestedSealed) {
      const iVar = `${GEN.index}${sk}`;
      code += `  for (var ${iVar}=0; ${iVar}<${varName}.length; ${iVar}++) {\n`;

      if (useInline) {
        const itemVar = `__il$${sk}_ci`;
        const ppExpr = ctx.pathPrefix
          ? `${ctx.pathPrefix}+${JSON.stringify(fieldKey)}+'['+${iVar}+'].'`
          : `${JSON.stringify(fieldKey)}+'['+${iVar}+'].'`;
        const vpPrefix = `${sk}c${iVar}_`;
        const itemInvalidPathExpr = ctx.pathPrefix
          ? `${ctx.pathPrefix}+${JSON.stringify(fieldKey)}+'['+${iVar}+'].'`
          : `${JSON.stringify(fieldKey)}+'['+${iVar}+'].'`;
        code += `    var ${itemVar} = ${varName}[${iVar}];\n`;
        code += `    if (${itemVar} == null || typeof ${itemVar} !== 'object' || Array.isArray(${itemVar})) `;
        if (collectErrors) {
          code += `${GEN.errList}.push({path:${itemInvalidPathExpr},code:'invalidInput'});\n`;
        } else {
          code += `return [{path:${itemInvalidPathExpr},code:'invalidInput'}];\n`;
        }
        code += `    else {\n`;
        code += emitInlineNestedBlock(nestedMerged!, nestedCls!, itemVar, ppExpr, vpPrefix, ctx);
        code += `    }\n`;
      } else {
        const execIdx = execs.length;
        execs.push(nestedSealed);
        code += `    var ${GEN.result}${sk} = ${awaitKw}_execs[${execIdx}]._validate(${varName}[${iVar}], _opts);\n`;
        code += `    if (${GEN.result}${sk} !== null) {\n`;
        const ppVar = `__bk$pp${sk}`;
        code += `      var ${ppVar} = ${JSON.stringify(fieldKey)}+'['+${iVar}+'].';\n`;
        if (collectErrors) {
          code += `      for (var ${GEN.nestedIdx}${sk}=0; ${GEN.nestedIdx}${sk}<${GEN.result}${sk}.length; ${GEN.nestedIdx}${sk}++) {\n`;
          code += `      ` + nestedErrPush(GEN.errList, `${ppVar}+${GEN.result}${sk}[${GEN.nestedIdx}${sk}].path`, `${GEN.result}${sk}[${GEN.nestedIdx}${sk}]`, `__ne${sk}`);
          code += `      }\n`;
        } else {
          code += `      ` + nestedErrReturn(`${ppVar}+${GEN.result}${sk}[0].path`, `${GEN.result}${sk}[0]`, `__ne${sk}`, true);
        }
        code += `    }\n`;
      }

      code += `  }\n`;
    }

    // each validation — iterate input array directly
    const eachRules = meta.validation.filter(rd => rd.each);
    if (eachRules.length > 0) {
      const eiVar = `${GEN.index}${sk}_e`;
      code += `  for (var ${eiVar}=0; ${eiVar}<${varName}.length; ${eiVar}++) {\n`;
      for (const rd of eachRules) {
        const prefixVar = `__bk$ep_${sk}`;
        const extra = computeRuleExtras(rd, fieldKey, varName, ctx);
        const failFn = (c: string) => collectErrors
          ? `${GEN.errList}.push({path:${prefixVar}+${eiVar}+']',code:${JSON.stringify(c)}${extra}})`
          : `return [{path:${prefixVar}+${eiVar}+']',code:${JSON.stringify(c)}${extra}}]`;
        const colEmitCtx: EmitContext = { ...emitCtx, fail: failFn };
        if (!code.includes(`var ${prefixVar}`)) code += `  var ${prefixVar} = ${JSON.stringify(fieldKey)}+'[';\n`;
        code += `    ${rd.rule.emit(`${varName}[${eiVar}]`, colEmitCtx)}\n`;
      }
      code += `  }\n`;
    }

    code += `} else { ${emitCtx.fail('isArray')}; }\n`;
  } else {
    // Map: validate object values
    code += `if (${varName} != null && typeof ${varName} === 'object' && !Array.isArray(${varName})) {\n`;

    if (nestedSealed) {
      const kVar = `${GEN.key}${sk}`;
      code += `  for (var ${kVar} in ${varName}) {\n`;
      code += `    if (!Object.prototype.hasOwnProperty.call(${varName}, ${kVar})) continue;\n`;

      if (useInline) {
        const itemVar = `__il$${sk}_mi`;
        const ppExpr = ctx.pathPrefix
          ? `${ctx.pathPrefix}+${JSON.stringify(fieldKey)}+'['+${kVar}+'].'`
          : `${JSON.stringify(fieldKey)}+'['+${kVar}+'].'`;
        const vpPrefix = `${sk}m${kVar}_`;
        const itemInvalidPathExpr = ppExpr;
        code += `    var ${itemVar} = ${varName}[${kVar}];\n`;
        code += `    if (${itemVar} == null || typeof ${itemVar} !== 'object' || Array.isArray(${itemVar})) `;
        if (collectErrors) {
          code += `${GEN.errList}.push({path:${itemInvalidPathExpr},code:'invalidInput'});\n`;
        } else {
          code += `return [{path:${itemInvalidPathExpr},code:'invalidInput'}];\n`;
        }
        code += `    else {\n`;
        code += emitInlineNestedBlock(nestedMerged!, nestedCls!, itemVar, ppExpr, vpPrefix, ctx);
        code += `    }\n`;
      } else {
        const execIdx = execs.length;
        execs.push(nestedSealed);
        code += `    var ${GEN.result}${sk} = ${awaitKw}_execs[${execIdx}]._validate(${varName}[${kVar}], _opts);\n`;
        code += `    if (${GEN.result}${sk} !== null) {\n`;
        const ppVar = `__bk$pp${sk}`;
        code += `      var ${ppVar} = ${JSON.stringify(fieldKey)}+'['+${kVar}+'].';\n`;
        if (collectErrors) {
          code += `      for (var ${GEN.nestedIdx}${sk}=0; ${GEN.nestedIdx}${sk}<${GEN.result}${sk}.length; ${GEN.nestedIdx}${sk}++) {\n`;
          code += `      ` + nestedErrPush(GEN.errList, `${ppVar}+${GEN.result}${sk}[${GEN.nestedIdx}${sk}].path`, `${GEN.result}${sk}[${GEN.nestedIdx}${sk}]`, `__ne${sk}`);
          code += `      }\n`;
        } else {
          code += `      ` + nestedErrReturn(`${ppVar}+${GEN.result}${sk}[0].path`, `${GEN.result}${sk}[0]`, `__ne${sk}`, true);
        }
        code += `    }\n`;
      }

      code += `  }\n`;
    }

    code += `} else { ${emitCtx.fail('isObject')}; }\n`;
  }

  return code;
}

// ─────────────────────────────────────────────────────────────────────────────
// makeEmitCtx — create per-field EmitContext
// ─────────────────────────────────────────────────────────────────────────────

function makeEmitCtx(fieldKey: string, ctx: FieldCodeContext): EmitContext {
  const { collectErrors, regexes, refs, execs, validateOnly, pathPrefix } = ctx;
  const pathExpr = pathPrefix ? `${pathPrefix}+${JSON.stringify(fieldKey)}` : JSON.stringify(fieldKey);
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
        return `${GEN.errList}.push({path:${pathExpr},code:${JSON.stringify(code)}})`;
      } else if (validateOnly) {
        return `return [{path:${pathExpr},code:${JSON.stringify(code)}}]`;
      } else {
        return `return _err([{path:${pathExpr},code:${JSON.stringify(code)}}])`;
      }
    },
    collectErrors,
    _pathExpr: pathExpr,
  };
}
