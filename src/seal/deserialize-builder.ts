import type { Result, ResultAsync } from '@zipbul/result';

import { err as resultErr, isErr as resultIsErr } from '@zipbul/result';

import type { SealOptions, RuntimeOptions } from '../interfaces';
import type { RawClassMeta, RawPropertyMeta, EmitContext, SealedExecutors, RuleDef, MessageArgs } from '../types';

import { CacheKey, CollectionType } from '../enums';
import { BakerError, type BakerIssue } from '../errors';
import { getSealed } from '../meta-access';
import { emitRulePlan } from '../rule-plan';
import { sanitizeKey, buildGroupsHasExpr } from './codegen-utils';
import { GuardKey } from './enums';

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
  // Cache errItemExpr once — avoids repeated property reads in the generated body
  const eVar = `${tmpVar}_e`;
  return (
    `var ${eVar}=${errItemExpr};\n` +
    `      if(${eVar}.message===undefined&&${eVar}.context===undefined){${errList}.push({path:${pathExpr},code:${eVar}.code});}\n` +
    `      else{var ${tmpVar}={path:${pathExpr},code:${eVar}.code};\n` +
    `      if(${eVar}.message!==undefined)${tmpVar}.message=${eVar}.message;\n` +
    `      if(${eVar}.context!==undefined)${tmpVar}.context=${eVar}.context;\n` +
    `      ${errList}.push(${tmpVar});}\n`
  );
}

/** Generate nested error return code that propagates message/context fields */
function nestedErrReturn(pathExpr: string, errItemExpr: string, tmpVar: string, validateOnly?: boolean): string {
  const ret = (arr: string) => (validateOnly ? `return ${arr};\n` : `return err(${arr});\n`);
  return (
    `if(${errItemExpr}.message===undefined&&${errItemExpr}.context===undefined)${ret(`[{path:${pathExpr},code:${errItemExpr}.code}]`)}` +
    `    var ${tmpVar}={path:${pathExpr},code:${errItemExpr}.code};\n` +
    `    if(${errItemExpr}.message!==undefined)${tmpVar}.message=${errItemExpr}.message;\n` +
    `    if(${errItemExpr}.context!==undefined)${tmpVar}.context=${errItemExpr}.context;\n` +
    `    ${ret(`[${tmpVar}]`)}`
  );
}

/** Convert field name to a safe JS variable name (includes prefix to prevent internal variable collisions) */
function toVarName(key: string, prefix?: string): string {
  return GEN.field + (prefix || '') + sanitizeKey(key);
}

/** Determine the extraction key for deserialization (§4.3 step 3) */
function getDeserializeExtractKey(fieldKey: string, exposeStack: RawPropertyMeta['expose']): string {
  // deserializeOnly @Expose with name → use that name
  const desDef = exposeStack.find(e => e.deserializeOnly && e.name);
  if (desDef) {
    return desDef.name!;
  }
  // Non-directional @Expose with name → use for both directions
  const biDef = exposeStack.find(e => !e.deserializeOnly && !e.serializeOnly && e.name);
  if (biDef) {
    return biDef.name!;
  }
  return fieldKey;
}

/** Determine field expose groups — returns undefined (no restriction) if any unconditional expose entry exists */
function getDeserializeExposeGroups(exposeStack: RawPropertyMeta['expose']): string[] | undefined {
  // Single-pass: scan once, bail out as soon as we see an unconditional entry,
  // lazily allocate the result Set.
  let all: Set<string> | null = null;
  for (const e of exposeStack) {
    if (e.serializeOnly) {
      continue;
    }
    if (!e.groups || e.groups.length === 0) {
      return undefined;
    }
    if (all === null) {
      all = new Set<string>();
    }
    for (const g of e.groups) {
      all.add(g);
    }
  }
  return all === null ? undefined : [...all];
}

// ─────────────────────────────────────────────────────────────────────────────
// buildDeserializeCode — new Function-based executor generation (§4.9)
// ─────────────────────────────────────────────────────────────────────────────

type DeserializeExecutor<T> = (input: unknown, opts?: RuntimeOptions) => Result<T, BakerIssue[]> | ResultAsync<T, BakerIssue[]>;
type ValidateExecutor = (input: unknown, opts?: RuntimeOptions) => BakerIssue[] | null | Promise<BakerIssue[] | null>;

function buildDeserializeCode<T>(
  Class: Function,
  merged: RawClassMeta,
  options: SealOptions | undefined,
  needsCircularCheck: boolean,
  isAsync: boolean,
  resolve?: (cls: Function) => SealedExecutors<unknown> | undefined,
): DeserializeExecutor<T>;
function buildDeserializeCode(
  Class: Function,
  merged: RawClassMeta,
  options: SealOptions | undefined,
  needsCircularCheck: boolean,
  isAsync: boolean,
  resolve: ((cls: Function) => SealedExecutors<unknown> | undefined) | undefined,
  validateOnly: true,
): ValidateExecutor;
function buildDeserializeCode<T>(
  Class: Function,
  merged: RawClassMeta,
  options: SealOptions | undefined,
  needsCircularCheck: boolean,
  isAsync: boolean,
  resolve: (cls: Function) => SealedExecutors<unknown> | undefined = getSealed,
  validateOnly = false,
): DeserializeExecutor<T> | ValidateExecutor {
  const stopAtFirstError = options?.stopAtFirstError ?? false;
  const collectErrors = !stopAtFirstError;
  const exposeDefaultValues = options?.exposeDefaultValues ?? false;

  // Reference arrays — injected into new Function closure
  const regexes: RegExp[] = [];
  const refs: unknown[] = [];
  const execs: SealedExecutors<unknown>[] = [];

  // ── Code generation ────────────────────────────────────────────────────────

  // Helper: wrap error array return — validate mode returns raw array, deserialize mode wraps in Result.err
  const wrapErr = validateOnly ? (inner: string) => inner : (inner: string) => `err(${inner})`;

  let body = "'use strict';\n";

  // Create instance — skip in validate mode (no object creation needed)
  if (validateOnly) {
    if (exposeDefaultValues) {
      body += 'var __bk$defs = new _Cls();\n';
    }
  } else {
    body += exposeDefaultValues ? `var ${GEN.out} = new _Cls();\n` : `var ${GEN.out} = Object.create(_Cls.prototype);\n`;
  }

  // Error array (collectErrors mode)
  if (collectErrors) {
    body += `var ${GEN.errList} = [];\n`;
  }

  // preamble: input type guard (§4.9)
  body += `if (input == null || typeof input !== 'object' || Array.isArray(input)) return ${wrapErr("[{path:'',code:'invalidInput'}]")};\n`;

  // WeakSet guard (circular references) — N-3 fix: WeakSet lives per-call, threaded through
  // `opts` via a Symbol-keyed slot so nested DTOs in the same call share it. Symbol keys are
  // invisible to `Object.keys`/checkCallOptions, so this doesn't pollute the user's opts shape.
  // The previous shared-ref WeakSet caused concurrent async deserialize() to false-positive.
  if (needsCircularCheck) {
    // __SEEN_KEY is hoisted out of the per-call body and captured via the closure
    // arguments of `new Function(...)` below — eliminates Symbol.for() lookup on every call.
    // Object literal spread is replaced with branched alloc — Bun/JSC optimizes literal-spread
    // better than Object.assign({}, ...) (audit H4/H5).
    body += `var __seen = (opts && opts[__SEEN_KEY]) || null;\n`;
    body += `if (__seen === null) { __seen = new WeakSet(); opts = opts ? { ...opts, [__SEEN_KEY]: __seen } : { [__SEEN_KEY]: __seen }; }\n`;
    body += `if (__seen.has(input)) return ${wrapErr("[{path:'',code:'circular'}]")};\n`;
    body += `__seen.add(input);\n`;
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

    // Indexed Object.keys loop — empirically 2–30× faster than for-in + Object.hasOwn on
    // Bun/JSC. The keys array allocation is dominated by the per-iteration cost of for-in's
    // prototype walk + hasOwn function call.
    if (collectErrors) {
      body += `{var __wlk=Object.keys(input);for(var __wli=0;__wli<__wlk.length;__wli++){var ${GEN.key}=__wlk[__wli];if(!refs[${allowedIdx}].has(${GEN.key}))${GEN.errList}.push({path:${GEN.key},code:'whitelistViolation'});}}\n`;
    } else {
      body += `{var __wlk=Object.keys(input);for(var __wli=0;__wli<__wlk.length;__wli++){var ${GEN.key}=__wlk[__wli];if(!refs[${allowedIdx}].has(${GEN.key}))return ${wrapErr(`[{path:${GEN.key},code:'whitelistViolation'}]`)};}}\n`;
    }
  }

  // Groups variable — only when expose groups or validation rule groups exist (§4.9, §M4).
  // Single for-of with early break avoids Object.values alloc + closure allocations.
  let hasGroupsField = false;
  for (const fk in merged) {
    const meta = merged[fk]!;
    const exposeGroups = getDeserializeExposeGroups(meta.expose);
    if (exposeGroups && exposeGroups.length > 0) {
      hasGroupsField = true;
      break;
    }
    let ruleHasGroups = false;
    for (const rd of meta.validation) {
      if (rd.groups && rd.groups.length > 0) {
        ruleHasGroups = true;
        break;
      }
    }
    if (ruleHasGroups) {
      hasGroupsField = true;
      break;
    }
  }
  if (hasGroupsField) {
    body += `var ${GEN.groups} = opts && opts.groups;\n`;
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
      resolve,
    });
    body += fieldCode;
  }

  // ── epilogue ──────────────────────────────────────────────────────────────

  if (collectErrors) {
    body += `if (${GEN.errList}.length) return ${validateOnly ? GEN.errList : `err(${GEN.errList})`};\n`;
  }
  body += `return ${validateOnly ? 'null' : GEN.out};\n`;

  // Close try/finally for circular reference WeakSet cleanup
  if (needsCircularCheck) {
    body += `} finally { __seen.delete(input); }\n`;
  }

  // sourceURL (§4.9)
  // Sanitize class name so it cannot inject newlines / */ that would break out of the comment.
  const safeClsName = Class.name.replace(/[^\w$.-]/g, '_');
  body += `//# sourceURL=baker://${safeClsName}/${validateOnly ? 'validate' : 'deserialize'}\n`;

  // ── Execute new Function ───────────────────────────────────────────────────

  const fnKeyword = isAsync ? 'async function' : 'function';
  const seenKey = Symbol.for('baker:circular-seen');
  const executor = new Function(
    '_Cls',
    're',
    'refs',
    'execs',
    'err',
    'isErr',
    '__SEEN_KEY',
    `return ${fnKeyword}(input, opts) { ` + body + ' }',
  )(Class, regexes, refs, execs, resultErr, resultIsErr, seenKey) as (
    input: unknown,
    opts?: RuntimeOptions,
  ) => Result<T, BakerIssue[]> | ResultAsync<T, BakerIssue[]>;

  return executor;
}

// ─────────────────────────────────────────────────────────────────────────────
// buildValidateCode — validate-only executor (no Object.create, no assignments)
// ─────────────────────────────────────────────────────────────────────────────

function buildValidateCode(
  Class: Function,
  merged: RawClassMeta,
  options: SealOptions | undefined,
  needsCircularCheck: boolean,
  isAsync: boolean,
  resolve: (cls: Function) => SealedExecutors<unknown> | undefined = getSealed,
): ValidateExecutor {
  return buildDeserializeCode(Class, merged, options, needsCircularCheck, isAsync, resolve, true);
}

// ─────────────────────────────────────────────────────────────────────────────
// nullable/optional guard — truth-table strategy pattern (D-3)
// ─────────────────────────────────────────────────────────────────────────────

function resolveGuardKey(isNullable: boolean, useOptionalGuard: boolean, isDefined: boolean): GuardKey {
  if (isNullable && useOptionalGuard) {
    return GuardKey.NullableOptional;
  }
  if (isNullable) {
    return GuardKey.Nullable;
  }
  if (isDefined) {
    return GuardKey.Defined;
  }
  if (useOptionalGuard) {
    return GuardKey.Optional;
  }
  return GuardKey.Default;
}

interface GuardParams {
  varName: string;
  emitCtx: EmitContext;
  assignNull: string;
  validationCode: string;
}

const GUARD_STRATEGIES: Record<GuardKey, (p: GuardParams) => string> = {
  // Case 4: @IsNullable + @IsOptional — assign null, skip undefined
  [GuardKey.NullableOptional]({ varName, assignNull, validationCode }) {
    let code = `if (${varName} === null) { ${assignNull}}\n`;
    code += `else if (${varName} !== undefined) {\n`;
    code += validationCode;
    code += '}\n';
    return code;
  },
  // Case 3: @IsNullable (+ optional @IsDefined — same behavior)
  [GuardKey.Nullable]({ varName, emitCtx, assignNull, validationCode }) {
    let code = `if (${varName} === undefined) ${emitCtx.fail('isDefined')};\n`;
    code += `else if (${varName} !== null) {\n`;
    code += validationCode;
    code += `} else { ${assignNull}}\n`;
    return code;
  },
  // @IsDefined — reject only undefined, null/""/0 etc. pass through to subsequent validation
  [GuardKey.Defined]({ varName, emitCtx, validationCode }) {
    let code = `if (${varName} === undefined) ${emitCtx.fail('isDefined')};\n`;
    code += validationCode;
    return code;
  },
  // Case 2: @IsOptional — skip entirely on undefined/null
  [GuardKey.Optional]({ varName, validationCode }) {
    let code = `if (${varName} !== undefined && ${varName} !== null) {\n`;
    code += validationCode;
    code += '}\n';
    return code;
  },
  // Case 1: No flags (default) — reject undefined/null
  [GuardKey.Default]({ varName, emitCtx, validationCode }) {
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
  /** Resolve a nested class's sealed executor from the owning baker's seal context. */
  resolve: (cls: Function) => SealedExecutors<unknown> | undefined;
  /** Track classes being inlined to detect circular references */
  inlineNestedClasses?: Set<Function>;
  /** JS expression for path prefix (inline nested context) */
  pathPrefix?: string;
  /** Prefix for generated variable names (inline nested context) */
  varPrefix?: string;
  /** Input object expression — 'input' by default, custom for inline nested */
  inputExpr?: string;
}

function generateFieldCode(fieldKey: string, meta: RawPropertyMeta, ctx: FieldCodeContext): string {
  const { exposeDefaultValues } = ctx;

  // ⓪ Exclude deserializeOnly / bidirectional → skip
  if (meta.exclude) {
    if (!meta.exclude.serializeOnly) {
      if (ctx.options?.debug) {
        const reason = meta.exclude.deserializeOnly ? 'deserializeOnly' : 'bidirectional';
        return `// [baker] field ${JSON.stringify(fieldKey)} excluded (${reason} @Exclude)\n`;
      }
      return '';
    }
  }

  // Expose: check if this field is exposed to deserialize
  // If all @Expose entries are serializeOnly, skip field
  if (meta.expose.length > 0 && meta.expose.every(e => e.serializeOnly)) {
    if (ctx.options?.debug) {
      return `// [baker] field ${JSON.stringify(fieldKey)} excluded (all @Expose entries are serializeOnly)\n`;
    }
    return '';
  }

  const varName = toVarName(fieldKey, ctx.varPrefix);
  const extractKey = getDeserializeExtractKey(fieldKey, meta.expose);
  const exposeGroups = getDeserializeExposeGroups(meta.expose);
  const inputObj = ctx.inputExpr || 'input';

  // Create EmitContext — bake field-level message/context so EVERY field-own-path failure
  // (gate, required-missing, conversion, structural gates) carries them, not just rule bodies.
  const fieldExtras = computeFieldExtras(meta, fieldKey, varName, ctx);
  const emitCtx = makeEmitCtx(fieldKey, ctx, fieldExtras);

  let fieldCode = '';

  // ① @ValidateIf guard
  let validateIfIdx: number | null = null;
  if (meta.flags.validateIf) {
    validateIfIdx = ctx.refs.length;
    ctx.refs.push(meta.flags.validateIf);
  }

  // ③ Extract + exposeDefaultValues — W7 (N-4): use Object.hasOwn to block prototype-inherited values
  let extractCode: string;
  const extractKeyJson = JSON.stringify(extractKey);
  if (exposeDefaultValues && !meta.flags.isOptional) {
    // exposeDefaultValues still needs hasOwn — must distinguish "missing key" (use default)
    // from "explicit undefined" (no default). Prototype-only keys are treated as missing.
    const defaultsSource = ctx.validateOnly ? '__bk$defs' : GEN.out;
    extractCode = `var ${varName} = Object.hasOwn(${inputObj}, ${extractKeyJson}) ? ${inputObj}[${extractKeyJson}] : ${defaultsSource}[${JSON.stringify(fieldKey)}];\n`;
  } else {
    // Direct property access (own or inherited), matching the fast-validator norm (e.g. ajv).
    // A per-field `Object.hasOwn` guard would read own-only but cost ~10 ns per 5-field DTO
    // (Bun 1.3.13 / i7-13700K) — a ~30% regression on the hot path. The only case it would change
    // is an input whose prototype chain carries a declared field name, which requires a global
    // `Object.prototype` pollution introduced elsewhere (a separate, pre-existing app vulnerability
    // — baker's own input gate rejects `__proto__` payloads). Normal inputs (JSON.parse, framework
    // request bodies) are always own-keyed, so this never triggers in practice.
    extractCode = `var ${varName} = ${inputObj}[${extractKeyJson}];\n`;
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
    fieldCode += fieldStart + `if (refs[${validateIfIdx}](${inputObj})) {\n` + innerCode + '}\n' + fieldEnd;
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
  const { collectErrors } = ctx;

  let code = '';

  // @Transform (deserialize direction) — before validation (§4.3 ⑤)
  const dsTransforms = meta.transform.filter(td => !td.options?.serializeOnly);
  if (dsTransforms.length > 0) {
    const fkJson = JSON.stringify(fieldKey);
    const objExpr = ctx.inputExpr || 'input';
    if (dsTransforms.length === 1) {
      const td = dsTransforms[0]!;
      const refIdx = ctx.refs.length;
      ctx.refs.push(td.fn);
      const callExpr = `refs[${refIdx}]({value:${varName},key:${fkJson},obj:${objExpr}})`;
      code += `${varName} = ${td.isAsync ? 'await ' : ''}${callExpr};\n`;
    } else if (dsTransforms.length === 2) {
      const td0 = dsTransforms[0]!;
      const td1 = dsTransforms[1]!;
      const refIdx0 = ctx.refs.length;
      ctx.refs.push(td0.fn);
      const refIdx1 = ctx.refs.length;
      ctx.refs.push(td1.fn);
      const call0 = `refs[${refIdx0}]({value:${varName},key:${fkJson},obj:${objExpr}})`;
      const expr0 = td0.isAsync ? `await ${call0}` : call0;
      const call1 = `refs[${refIdx1}]({value:${expr0},key:${fkJson},obj:${objExpr}})`;
      code += `${varName} = ${td1.isAsync ? 'await ' : ''}${call1};\n`;
    } else {
      for (const td of dsTransforms) {
        const refIdx = ctx.refs.length;
        ctx.refs.push(td.fn);
        const callExpr = `refs[${refIdx}]({value:${varName},key:${fkJson},obj:${objExpr}})`;
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
    if (!ctx.validateOnly) {
      code += `${GEN.out}[${JSON.stringify(fieldKey)}] = ${varName};\n`;
    }
    return code;
  }

  // Build validation with type gate
  code += buildRulesCode(fieldKey, varName, meta.validation, collectErrors, emitCtx, ctx, meta, fieldGroups);

  return code;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers for computing message/context extra fields in generated issue objects
// ─────────────────────────────────────────────────────────────────────────────

/** Build the `,message:...,context:...` extras string for a generated issue object.
 *  `getConstraintsArg` produces the JS expression for a message function's `constraints`
 *  field; it runs AFTER the message ref is pushed, preserving ref-array order. */
function buildIssueExtras(
  message: string | ((args: MessageArgs) => string) | undefined,
  context: unknown,
  getConstraintsArg: () => string,
  fieldKey: string,
  varName: string,
  ctx: FieldCodeContext,
): string {
  let extra = '';
  if (typeof message === 'string') {
    extra += `,message:${JSON.stringify(message)}`;
  } else if (typeof message === 'function') {
    const msgIdx = ctx.refs.length;
    ctx.refs.push(message as unknown);
    const constraintsArg = getConstraintsArg();
    extra += `,message:refs[${msgIdx}]({property:${JSON.stringify(fieldKey)},value:${varName},constraints:${constraintsArg}})`;
  }
  if (context !== undefined) {
    const ctxIdx = ctx.refs.length;
    ctx.refs.push(context);
    extra += `,context:refs[${ctxIdx}]`;
  }
  return extra;
}

/** Per-rule extras — a message function receives the failing rule's `constraints`. */
function computeRuleExtras(rd: RuleDef, fieldKey: string, varName: string, ctx: FieldCodeContext): string {
  return buildIssueExtras(
    rd.message,
    rd.context,
    () => {
      const constraintsIdx = ctx.refs.length;
      ctx.refs.push(rd.rule.constraints ?? {});
      return `refs[${constraintsIdx}]`;
    },
    fieldKey,
    varName,
    ctx,
  );
}

/** Field-level extras appended to EVERY failure of a field — including non-rule failures
 *  (type gate, required-missing, conversion, structural gates) and type-only fields. No
 *  specific rule applies, so a message function gets `constraints:{}`. */
function computeFieldExtras(meta: RawPropertyMeta, fieldKey: string, varName: string, ctx: FieldCodeContext): string {
  return buildIssueExtras(meta.message, meta.context, () => '{}', fieldKey, varName, ctx);
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
  if (!extra) {
    return baseEmitCtx;
  }
  const pathExpr = baseEmitCtx.pathExpr ?? JSON.stringify(fieldKey);
  return {
    ...baseEmitCtx,
    fail(code: string): string {
      if (baseEmitCtx.collectErrors) {
        return `${GEN.errList}.push({path:${pathExpr},code:${JSON.stringify(code)}${extra}})`;
      } else if (ctx.validateOnly) {
        return `return [{path:${pathExpr},code:${JSON.stringify(code)}${extra}}]`;
      }
      return `return err([{path:${pathExpr},code:${JSON.stringify(code)}${extra}}])`;
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
  // Single-pass partition over rules, counting both cacheable categories without a filter[] alloc.
  let lengthCount = 0;
  let timeCount = 0;
  for (const rd of rules) {
    if (!sameGroups(rd.groups, fieldGroups)) {
      continue;
    }
    if (rd.rule.plan?.cacheKey === CacheKey.Length) {
      lengthCount += 1;
    } else if (rd.rule.plan?.cacheKey === CacheKey.Time) {
      timeCount += 1;
    }
  }
  const sk = sanitizeKey(fieldKey);
  const lengthVar = lengthCount > 1 ? `${GEN.arr}${sk}len` : null;
  const timeVar = timeCount > 1 ? `${GEN.arr}${sk}time` : null;

  if (lengthVar) {
    code += `${indent}var ${lengthVar} = ${varName}.length;\n`;
  }
  if (timeVar) {
    code += `${indent}var ${timeVar} = ${varName}.getTime();\n`;
  }

  for (const rd of rules) {
    const sg = sameGroups(rd.groups, fieldGroups); // cache once — was called 3× per rule
    const ruleEmitCtx = makeRuleEmitCtx(emitCtx, fieldKey, varName, rd, ctx);
    const gatedCtx = insideTypeGate ? { ...ruleEmitCtx, insideTypeGate: true } : ruleEmitCtx;
    let emitted: string;
    if (sg && rd.rule.plan && (lengthVar || timeVar)) {
      const cache: { length?: string; time?: string } = {};
      if (rd.rule.plan.cacheKey === CacheKey.Length && lengthVar) {
        cache.length = lengthVar;
      }
      if (rd.rule.plan.cacheKey === CacheKey.Time && timeVar) {
        cache.time = timeVar;
      }
      emitted = emitRulePlan(varName, gatedCtx, rd.rule.ruleName, rd.rule.plan, cache, insideTypeGate);
    } else {
      emitted = rd.rule.emit(varName, gatedCtx);
    }
    if (!emitted) {
      continue;
    } // empty emit (e.g., asserter fully subsumed by gate)
    const ruleCode = sg ? emitted : wrapGroupsGuard(rd, emitted);
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
  if (!rd.groups || rd.groups.length === 0) {
    return code;
  }
  return `if ((${GEN.group0} === null && !${GEN.groupsSet}) || ${buildGroupsHasExpr(GEN.group0, GEN.groupsSet, rd.groups)}) {\n${code}\n}\n`;
}

function sameGroups(a?: string[], b?: string[]): boolean {
  if (!a || a.length === 0) {
    return !b || b.length === 0;
  }
  if (!b || a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
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
      throw new BakerError(`Unknown implicit conversion type: "${targetType}" for field "${fieldKey}"`);
  }
}

/** `@Type`() primitive builtin → target type mapping */
const PRIMITIVE_TYPE_HINTS: Record<string, string> = {
  Number: 'number',
  Boolean: 'boolean',
  String: 'string',
  Date: 'date',
};

/** Asserter rule name → gate type mapping */
const ASSERTER_TO_GATE: Record<string, string> = {
  isString: 'string',
  isNumber: 'number',
  isBoolean: 'boolean',
  isDate: 'date',
  isInt: 'number',
  isArray: 'array',
  isObject: 'object',
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
function categorizeRules(fieldKey: string, validation: RawPropertyMeta['validation']): CategorizedRules {
  // Single-pass partition — was 9 separate .filter() passes over the same array, each allocating
  // a fresh intermediate. For a field with N rules, runs at seal time only but adds up across DTOs.
  const each: RuleDef[] = [];
  const generalRules: RuleDef[] = [];
  const typedBuckets: Record<string, RuleDef[]> = {
    string: [],
    number: [],
    boolean: [],
    date: [],
    array: [],
    object: [],
  };
  for (const rd of validation) {
    if (rd.each) {
      each.push(rd);
      continue;
    }
    const reqType = rd.rule.requiresType;
    if (reqType !== undefined) {
      typedBuckets[reqType]!.push(rd);
    } else {
      generalRules.push(rd);
    }
  }

  // Mixed gate conflict detection — at most one bucket should be non-empty
  let chosen: CategorizedRules['typedDeps'] = undefined;
  let activeTypes: string[] | null = null;
  for (const t of ['string', 'number', 'boolean', 'date', 'array', 'object'] as const) {
    const deps = typedBuckets[t]!;
    if (deps.length === 0) {
      continue;
    }
    if (chosen) {
      // Late allocation: only build the array when we actually need to report a conflict
      if (activeTypes === null) {
        activeTypes = [chosen.type];
      }
      activeTypes.push(t);
    } else {
      chosen = { type: t, deps };
    }
  }
  if (activeTypes) {
    throw new BakerError(`Field "${fieldKey}" has conflicting requiresType: ${activeTypes.join(', ')}`);
  }

  return { each, generalRules, typedDeps: chosen };
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
  const enableConversion = !!ctx.options?.enableImplicitConversion && !meta?.transform.some(td => !td.options?.serializeOnly);

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
      typeHintGate = typeCtor ? (PRIMITIVE_TYPE_HINTS[typeCtor.name] ?? null) : null;
    } catch (e) {
      throw new BakerError(`field "${fieldKey}": @Field type function threw: ${(e as Error).message}`, { cause: e });
    }
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
  const sk = sanitizeKey(fieldKey); // cached — was called up to 4× in this function before

  const { effectiveGateType, gateCondition, gateErrorCode, gateEmitCtx, otherGeneral, gateDeps, typeAsserter, enableConversion } =
    config;

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
    const canConvert =
      enableConversion &&
      (effectiveGateType === 'string' ||
        effectiveGateType === 'number' ||
        effectiveGateType === 'boolean' ||
        effectiveGateType === 'date');

    if (canConvert) {
      // Conversion mode: try convert on gate failure, skip field if conversion fails
      const skipVar = `${GEN.skip}${sk}`;
      code += `var ${skipVar} = false;\n`;
      code += `if (${gateCondition}) {\n`;
      code += generateConversionCode(effectiveGateType, varName, fieldKey, skipVar, true, emitCtx);
      code += `}\n`;
      code += `if (!${skipVar}) {\n`;
      if (ctx.validateOnly) {
        code += emitInnerRules('  ');
      } else {
        const markVar = `${GEN.mark}${sk}`;
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
        const markVar = `${GEN.mark}${sk}`;
        code += `  var ${markVar} = ${GEN.errList}.length;\n`;
        code += emitInnerRules('  ');
        code += `  if (${GEN.errList}.length === ${markVar}) ${GEN.out}[${JSON.stringify(fieldKey)}] = ${varName};\n`;
      }
      code += `}\n`;
    }
  } else {
    const canConvert =
      enableConversion &&
      (effectiveGateType === 'string' ||
        effectiveGateType === 'number' ||
        effectiveGateType === 'boolean' ||
        effectiveGateType === 'date');

    if (canConvert) {
      code += `if (${gateCondition}) {\n`;
      code += generateConversionCode(effectiveGateType, varName, fieldKey, null, false, emitCtx);
      code += `}\n`;
      code += emitInnerRules('');
      if (!ctx.validateOnly) {
        code += `${GEN.out}[${JSON.stringify(fieldKey)}] = ${varName};\n`;
      }
    } else {
      code += `if (${gateCondition}) ${gateEmitCtx.fail(gateErrorCode)};\n`;
      code += emitInnerRules('');
      if (!ctx.validateOnly) {
        code += `${GEN.out}[${JSON.stringify(fieldKey)}] = ${varName};\n`;
      }
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
      if (!ctx.validateOnly) {
        code += `${GEN.out}[${JSON.stringify(fieldKey)}] = ${varName};\n`;
      }
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
    if (!ctx.validateOnly) {
      code += `${GEN.out}[${JSON.stringify(fieldKey)}] = ${varName};\n`;
    }
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
  if (eachRules.length === 0) {
    return code;
  }

  // pathKey must honor ctx.pathPrefix so inlined nested DTOs report full path.
  // Without this, validate(Parent, ...) returned `tags[1]` while deserialize returned `nested.tags[1]`.
  const pathKey = ctx.pathPrefix ? `${ctx.pathPrefix}+${JSON.stringify(fieldKey)}` : JSON.stringify(fieldKey);
  const sk = sanitizeKey(fieldKey);
  const iVar = `${GEN.index}${sk}`;
  const siVar = `${GEN.setIdx}${sk}`;
  const svVar = `${GEN.setVal}${sk}`;
  const miVar = `${GEN.mapIdx}${sk}`;
  const mvVar = `${GEN.mapVal}${sk}`;
  const prefixVar = `__bk$ep_${sk}`;
  const kindVar = `__bk$ck${sk}`;

  // Collection kind + non-collection (isArray) rejection are FIELD-level, not per-rule: compute the
  // kind once and reject a non-array/Set/Map a single time. Emitting these inside the per-rule loop
  // pushed a duplicate `isArray` issue for every element rule when a non-collection value was given.
  code += `var ${kindVar} = Array.isArray(${varName})?1:(${varName} instanceof Set?2:(${varName} instanceof Map?3:0));\n`;
  code += `var ${prefixVar} = ${pathKey}+'[';\n`;
  code += `if (${kindVar} === 0) ${emitCtx.fail('isArray')};\n`;

  for (const rd of eachRules) {
    const extra = computeRuleExtras(rd, fieldKey, varName, ctx);
    // Cache the groups-guard predicate once — was previously evaluated twice (open + close)
    const rdGroups = rd.groups && rd.groups.length > 0 && !sameGroups(rd.groups, fieldGroups) ? rd.groups : null;
    const eachGuardOpen = rdGroups
      ? `if ((${GEN.group0} === null && !${GEN.groupsSet}) || ${buildGroupsHasExpr(GEN.group0, GEN.groupsSet, rdGroups)}) {\n`
      : '';
    const eachGuardClose = rdGroups ? '}\n' : '';

    // Collection descriptors: [idxVar, elemExpr, loopHeader, counterDecl, counterInc]
    const collections = [
      {
        guard: `Array.isArray(${varName})`,
        idxVar: iVar,
        elemExpr: `${varName}[${iVar}]`,
        loopHeader: `for (var ${iVar}=0; ${iVar}<${varName}.length; ${iVar}++)`,
        counterDecl: '',
        counterInc: '',
      },
      {
        guard: `${varName} instanceof Set`,
        idxVar: siVar,
        elemExpr: svVar,
        loopHeader: `for (var ${svVar} of ${varName})`,
        counterDecl: `var ${siVar} = 0;\n`,
        counterInc: `${siVar}++;\n`,
      },
      {
        guard: `${varName} instanceof Map`,
        idxVar: miVar,
        elemExpr: mvVar,
        loopHeader: `for (var ${mvVar} of ${varName}.values())`,
        counterDecl: `var ${miVar} = 0;\n`,
        counterInc: `${miVar}++;\n`,
      },
    ];

    // prefixVar (path prefix) is declared once at field level and reused by all branches.
    const emitCollectionBlock = (col: (typeof collections)[number]): string => {
      const failFn = (c: string) =>
        collectErrors
          ? `${GEN.errList}.push({path:${prefixVar}+${col.idxVar}+']',code:${JSON.stringify(c)}${extra}})`
          : ctx.validateOnly
            ? `return [{path:${prefixVar}+${col.idxVar}+']',code:${JSON.stringify(c)}${extra}}]`
            : `return err([{path:${prefixVar}+${col.idxVar}+']',code:${JSON.stringify(c)}${extra}}])`;
      const colEmitCtx: EmitContext = { ...emitCtx, fail: failFn };
      let block = '';
      block += `  ${col.counterDecl}`;
      block += `  ${col.loopHeader} {\n`;
      block += '    ' + rd.rule.emit(col.elemExpr, colEmitCtx) + '\n';
      if (col.counterInc) {
        block += `    ${col.counterInc}`;
      }
      block += `  }\n`;
      return block;
    };

    // Element loops per collection kind. The kind dispatch and the non-collection (isArray)
    // rejection are emitted once at field level above; here we only run the element loop for the
    // matching kind. kind 0 (non-collection) was already rejected, so no `else` branch is needed.
    code += eachGuardOpen;
    code += `if (${kindVar} === 1) {\n`;
    code += emitCollectionBlock(collections[0]!);
    code += `} else if (${kindVar} === 2) {\n`;
    code += emitCollectionBlock(collections[1]!);
    code += `} else if (${kindVar} === 3) {\n`;
    code += emitCollectionBlock(collections[2]!);
    code += `}\n`;
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
    const gateEmitCtx = resolved.typeAsserter ? makeRuleEmitCtx(emitCtx, fieldKey, varName, resolved.typeAsserter, ctx) : emitCtx;

    code += emitTypedRules(
      fieldKey,
      varName,
      collectErrors,
      emitCtx,
      ctx,
      {
        effectiveGateType: resolved.effectiveGateType!,
        gateCondition,
        gateErrorCode,
        gateEmitCtx,
        otherGeneral,
        gateDeps: resolved.gateDeps,
        typeAsserter: resolved.typeAsserter,
        enableConversion: resolved.enableConversion,
      },
      fieldGroups,
    );
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
    const nestedSealed = ctx.resolve(meta.type!.resolvedCollectionValue) as SealedExecutors<unknown>;
    execIdx = execs.length;
    execs.push(nestedSealed);
  }

  let code = '';

  if (collection === CollectionType.Set) {
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
      code += `    var ${GEN.result}${sk} = ${awaitKw}execs[${execIdx}].deserialize(${varName}[${iVar}], opts);\n`;
      code += `    if (isErr(${GEN.result}${sk})) {\n`;
      if (collectErrors) {
        code += `      var ${GEN.errors}${sk} = ${GEN.result}${sk}.data;\n`;
        code += `      var __bk$pp${sk} = ${JSON.stringify(fieldKey)}+'['+${iVar}+'].';\n`;
        code += `      for (var ${GEN.nestedIdx}${sk}=0; ${GEN.nestedIdx}${sk}<${GEN.errors}${sk}.length; ${GEN.nestedIdx}${sk}++) {\n`;
        code +=
          `      ` +
          nestedErrPush(
            GEN.errList,
            `__bk$pp${sk}+${GEN.errors}${sk}[${GEN.nestedIdx}${sk}].path`,
            `${GEN.errors}${sk}[${GEN.nestedIdx}${sk}]`,
            `__ne${sk}`,
          );
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
        const extra = computeRuleExtras(rd, fieldKey, varName, ctx);
        const failFn = (c: string) =>
          collectErrors
            ? `${GEN.errList}.push({path:${JSON.stringify(fieldKey)}+'['+${siVar}+']',code:${JSON.stringify(c)}${extra}})`
            : `return err([{path:${JSON.stringify(fieldKey)}+'['+${siVar}+']',code:${JSON.stringify(c)}${extra}}])`;
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
      // nested DTO Map — indexed Object.keys loop (measured 2-30× faster than for-in+hasOwn on Bun/JSC)
      const kVar = `${GEN.key}${sk}`;
      const ksVar = `__bk$mk${sk}`;
      const iVarMap = `__bk$mi${sk}`;
      code += `  var ${GEN.arr}${sk} = new Map();\n`;
      code += `  var ${ksVar} = Object.keys(${varName});\n`;
      code += `  for (var ${iVarMap}=0; ${iVarMap}<${ksVar}.length; ${iVarMap}++) {\n`;
      code += `    var ${kVar} = ${ksVar}[${iVarMap}];\n`;
      code += `    var ${GEN.result}${sk} = ${awaitKw}execs[${execIdx}].deserialize(${varName}[${kVar}], opts);\n`;
      code += `    if (isErr(${GEN.result}${sk})) {\n`;
      if (collectErrors) {
        code += `      var ${GEN.errors}${sk} = ${GEN.result}${sk}.data;\n`;
        code += `      var __bk$pp${sk} = ${JSON.stringify(fieldKey)}+'['+${kVar}+'].';\n`;
        code += `      for (var ${GEN.nestedIdx}${sk}=0; ${GEN.nestedIdx}${sk}<${GEN.errors}${sk}.length; ${GEN.nestedIdx}${sk}++) {\n`;
        code +=
          `      ` +
          nestedErrPush(
            GEN.errList,
            `__bk$pp${sk}+${GEN.errors}${sk}[${GEN.nestedIdx}${sk}].path`,
            `${GEN.errors}${sk}[${GEN.nestedIdx}${sk}]`,
            `__ne${sk}`,
          );
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
      // primitive Map — indexed Object.keys loop
      const ksVar = `__bk$mk${sk}`;
      const iVarMap = `__bk$mi${sk}`;
      code += `  var ${GEN.arr}${sk} = new Map();\n`;
      code += `  var ${ksVar} = Object.keys(${varName});\n`;
      code += `  for (var ${iVarMap}=0; ${iVarMap}<${ksVar}.length; ${iVarMap}++) {\n`;
      code += `    var ${GEN.key}${sk} = ${ksVar}[${iVarMap}];\n`;
      code += `    ${GEN.arr}${sk}.set(${GEN.key}${sk}, ${varName}[${GEN.key}${sk}]);\n`;
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

  if (!meta.type) {
    return `${GEN.out}[${JSON.stringify(fieldKey)}] = ${varName};\n`;
  }

  let code = '';
  const sk = sanitizeKey(fieldKey);

  if (meta.type.discriminator) {
    // §8.3 discriminator
    const discProp = JSON.stringify(meta.type.discriminator.property);
    code += `var ${GEN.disc}${sk} = ${varName} && ${varName}[${discProp}];\n`;
    code += `switch (${GEN.disc}${sk}) {\n`;
    for (const sub of meta.type.discriminator.subTypes) {
      const nestedSealed = ctx.resolve(sub.value) as SealedExecutors<unknown> | undefined;
      const execIdx = execs.length;
      execs.push(nestedSealed as SealedExecutors<unknown>);
      const awaitKwD = ctx.isAsync ? 'await ' : '';
      code += `  case ${JSON.stringify(sub.name)}:\n`;
      code += `    var ${GEN.result}${sk} = ${awaitKwD}execs[${execIdx}].deserialize(${varName}, opts);\n`;
      code += generateNestedResultCode(fieldKey, `${GEN.result}${sk}`, collectErrors, ctx.pathPrefix);
      code += `    break;\n`;
    }
    const validSubTypeNamesJson = JSON.stringify(meta.type.discriminator.subTypes.map(s => s.name));
    const discPathExpr = emitCtx.pathExpr ?? JSON.stringify(fieldKey);
    const discValueExpr = `${GEN.disc}${sk}`;
    if (collectErrors) {
      code += `  default: ${GEN.errList}.push({path:${discPathExpr},code:'invalidDiscriminator',context:{received:${discValueExpr},validSubTypes:${validSubTypeNamesJson}}});\n`;
    } else if (ctx.validateOnly) {
      code += `  default: return [{path:${discPathExpr},code:'invalidDiscriminator',context:{received:${discValueExpr},validSubTypes:${validSubTypeNamesJson}}}];\n`;
    } else {
      code += `  default: return err([{path:${discPathExpr},code:'invalidDiscriminator',context:{received:${discValueExpr},validSubTypes:${validSubTypeNamesJson}}}]);\n`;
    }
    code += `}\n`;
    // keepDiscriminatorProperty: preserve discriminator property in result object (PB-3)
    if (meta.type.keepDiscriminatorProperty) {
      const fkJson = JSON.stringify(fieldKey);
      code += `{var __dh=${GEN.out}[${fkJson}]; if(__dh!=null) __dh[${discProp}]=${GEN.disc}${sk};}\n`;
    }
  } else {
    // §8.1 simple nested or §8.2 each array
    const nestedCls = meta.type.resolvedClass ?? (meta.type.fn() as Function);
    const nestedSealed = ctx.resolve(nestedCls) as SealedExecutors<unknown> | undefined;
    const execIdx = execs.length;
    execs.push(nestedSealed as SealedExecutors<unknown>);

    // Check if validateNested each (array) — meta.type is already proven non-null above
    const hasEach = meta.type.isArray || meta.flags.validateNestedEach || meta.validation.some(rd => rd.each);

    if (hasEach) {
      const iVar = `${GEN.index}${sk}`;
      const awaitKwE = ctx.isAsync ? 'await ' : '';
      code += `if (Array.isArray(${varName})) {\n`;

      // Emit non-each array-level validation rules (e.g. @ArrayMinSize, @ArrayMaxSize)
      const nonEachRules = meta.validation.filter(rd => !rd.each);
      code += emitRuleList(fieldKey, varName, nonEachRules, emitCtx, ctx, '  ');

      code += `  var ${GEN.arr}${sk} = [];\n`;
      code += `  for (var ${iVar}=0; ${iVar}<${varName}.length; ${iVar}++) {\n`;
      code += `    var ${GEN.result}${sk} = ${awaitKwE}execs[${execIdx}].deserialize(${varName}[${iVar}], opts);\n`;
      code += `    if (isErr(${GEN.result}${sk})) {\n`;
      if (collectErrors) {
        code += `      var ${GEN.errors}${sk} = ${GEN.result}${sk}.data;\n`;
        code += `      var __bk$pp${sk} = ${JSON.stringify(fieldKey)}+'['+${iVar}+'].';\n`;
        code += `      for (var ${GEN.nestedIdx}${sk}=0; ${GEN.nestedIdx}${sk}<${GEN.errors}${sk}.length; ${GEN.nestedIdx}${sk}++) {\n`;
        code +=
          `      ` +
          nestedErrPush(
            GEN.errList,
            `__bk$pp${sk}+${GEN.errors}${sk}[${GEN.nestedIdx}${sk}].path`,
            `${GEN.errors}${sk}[${GEN.nestedIdx}${sk}]`,
            `__ne${sk}`,
          );
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
      code += `if (${varName} != null && typeof ${varName} === 'object' && !Array.isArray(${varName})) {\n`;
      code += `  var ${GEN.result}${sk} = ${awaitKwS}execs[${execIdx}].deserialize(${varName}, opts);\n`;
      code += generateNestedResultCode(fieldKey, `${GEN.result}${sk}`, collectErrors, ctx.pathPrefix);
      code += `} else { ${emitCtx.fail('isObject')}; }\n`;
    }
  }

  return code;
}

function generateNestedResultCode(fieldKey: string, resultVar: string, collectErrors: boolean, pathPrefix?: string): string {
  const sk = sanitizeKey(fieldKey);
  // Prepend the current scope's path prefix so an executor reached from inside an inlined block
  // (e.g. a circular nested DTO) keeps the full path, not just `fieldKey.`.
  const ppValue = pathPrefix ? `${pathPrefix}+${JSON.stringify(fieldKey + '.')}` : JSON.stringify(fieldKey + '.');
  if (collectErrors) {
    const errItem = `${GEN.errors}${sk}[${GEN.nestedIdx}${sk}]`;
    return (
      `  if (isErr(${resultVar})) {\n` +
      `    var ${GEN.errors}${sk} = ${resultVar}.data;\n` +
      `    var __bk$pp${sk} = ${ppValue};\n` +
      `    for (var ${GEN.nestedIdx}${sk}=0; ${GEN.nestedIdx}${sk}<${GEN.errors}${sk}.length; ${GEN.nestedIdx}${sk}++) {\n` +
      `      ` +
      nestedErrPush(GEN.errList, `__bk$pp${sk}+${errItem}.path`, errItem, `__ne${sk}`) +
      `    }\n` +
      `  } else { ${GEN.out}[${JSON.stringify(fieldKey)}] = ${resultVar}; }\n`
    );
  }
  const errFirst = `${GEN.errors}${sk}[0]`;
  return (
    `  if (isErr(${resultVar})) {\n` +
    `    var ${GEN.errors}${sk} = ${resultVar}.data;\n` +
    `    var __bk$pp${sk} = ${ppValue};\n` +
    `    ` +
    nestedErrReturn(`__bk$pp${sk}+${errFirst}.path`, errFirst, `__ne${sk}`) +
    `  } else { ${GEN.out}[${JSON.stringify(fieldKey)}] = ${resultVar}; }\n`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// generateNestedCodeValidateOnly — validate-only nested (inline when possible)
// ─────────────────────────────────────────────────────────────────────────────

// Inline-eligibility predicate: a nested DTO can be inlined unless it is already in the
// active inline-set (circular reference). Inlined directly at the three call sites below
// — no extra function call at seal time.

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
    resolve: ctx.resolve,
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
  if (!meta.type) {
    return '';
  }
  const sk = (ctx.varPrefix || '') + sanitizeKey(fieldKey);
  let code = '';

  // Initialize inline tracking set if not present
  if (!ctx.inlineNestedClasses) {
    ctx.inlineNestedClasses = new Set();
  }

  if (meta.type.discriminator) {
    // Discriminator — inline each subType's validation
    const discProp = JSON.stringify(meta.type.discriminator.property);
    code += `var ${GEN.disc}${sk} = ${varName} && ${varName}[${discProp}];\n`;
    code += `switch (${GEN.disc}${sk}) {\n`;
    for (const sub of meta.type.discriminator.subTypes) {
      const subSealed = ctx.resolve(sub.value) as SealedExecutors<unknown>;
      const subMerged = subSealed.merged;
      const canInline = subMerged && !ctx.inlineNestedClasses.has(sub.value);
      code += `  case ${JSON.stringify(sub.name)}:\n`;
      if (canInline) {
        const ppExpr = ctx.pathPrefix ? `${ctx.pathPrefix}+${JSON.stringify(fieldKey + '.')}` : JSON.stringify(fieldKey + '.');
        const vpPrefix = `${sk}_d${sanitizeKey(sub.name)}_`;
        code += emitInlineNestedBlock(subMerged!, sub.value, varName, ppExpr, vpPrefix, ctx);
      } else {
        const execIdx = execs.length;
        execs.push(subSealed);
        const awaitKw = ctx.isAsync ? 'await ' : '';
        code += `    var ${GEN.result}${sk} = ${awaitKw}execs[${execIdx}].validate(${varName}, opts);\n`;
        code += generateValidateNestedResult(fieldKey, `${GEN.result}${sk}`, collectErrors, ctx.pathPrefix);
      }
      code += `    break;\n`;
    }
    const validSubTypeNamesJsonV = JSON.stringify(meta.type.discriminator.subTypes.map(s => s.name));
    const discPathExprV = emitCtx.pathExpr ?? JSON.stringify(fieldKey);
    const discValueExprV = `${GEN.disc}${sk}`;
    if (collectErrors) {
      code += `  default: ${GEN.errList}.push({path:${discPathExprV},code:'invalidDiscriminator',context:{received:${discValueExprV},validSubTypes:${validSubTypeNamesJsonV}}});\n`;
    } else {
      code += `  default: return [{path:${discPathExprV},code:'invalidDiscriminator',context:{received:${discValueExprV},validSubTypes:${validSubTypeNamesJsonV}}}];\n`;
    }
    code += `}\n`;
  } else {
    const nestedCls = meta.type.resolvedClass ?? (meta.type.fn() as Function);
    const nestedSealed = ctx.resolve(nestedCls) as SealedExecutors<unknown>;
    const nestedMerged = nestedSealed.merged;
    const hasEach = meta.type.isArray || meta.flags.validateNestedEach || meta.validation.some(rd => rd.each);

    // Decide: inline or function call
    const useInline = nestedMerged && !ctx.inlineNestedClasses.has(nestedCls);

    if (hasEach) {
      const iVar = `${GEN.index}${sk}`;
      code += `if (Array.isArray(${varName})) {\n`;
      const nonEachRules = meta.validation.filter(rd => !rd.each);
      code += emitRuleList(fieldKey, varName, nonEachRules, emitCtx, ctx, '  ');

      code += `  for (var ${iVar}=0; ${iVar}<${varName}.length; ${iVar}++) {\n`;

      if (useInline) {
        // INLINE: generate validation code directly in the loop body.
        // Emit the per-iteration path as a single local var — both the invalidInput error
        // path and the nested block reference it, avoiding two identical 3-string concats.
        const itemVar = `__il$${sk}item`;
        const ppVar = `__bk$pp${sk}`;
        const ppExpr = ppVar;
        const ppInit = ctx.pathPrefix
          ? `${ctx.pathPrefix}+${JSON.stringify(fieldKey)}+'['+${iVar}+'].'`
          : `${JSON.stringify(fieldKey)}+'['+${iVar}+'].'`;
        const vpPrefix = `${sk}i_`;

        code += `    var ${itemVar} = ${varName}[${iVar}];\n`;
        code += `    var ${ppVar} = ${ppInit};\n`;
        // Input type guard for the item — uses the cached prefix
        code += `    if (${itemVar} == null || typeof ${itemVar} !== 'object' || Array.isArray(${itemVar})) `;
        if (collectErrors) {
          code += `${GEN.errList}.push({path:${ppVar},code:'invalidInput'});\n`;
        } else {
          code += `return [{path:${ppVar},code:'invalidInput'}];\n`;
        }
        code += `    else {\n`;
        code += emitInlineNestedBlock(nestedMerged!, nestedCls, itemVar, ppExpr, vpPrefix, ctx);
        code += `    }\n`;
      } else {
        // FALLBACK: function call to validate
        const execIdx = execs.length;
        execs.push(nestedSealed);
        const awaitKw = ctx.isAsync ? 'await ' : '';
        code += `    var ${GEN.result}${sk} = ${awaitKw}execs[${execIdx}].validate(${varName}[${iVar}], opts);\n`;
        code += `    if (${GEN.result}${sk} !== null) {\n`;
        const ppVar = `__bk$pp${sk}`;
        const ppInit = ctx.pathPrefix
          ? `${ctx.pathPrefix}+${JSON.stringify(fieldKey)}+'['+${iVar}+'].'`
          : `${JSON.stringify(fieldKey)}+'['+${iVar}+'].'`;
        code += `      var ${ppVar} = ${ppInit};\n`;
        if (collectErrors) {
          code += `      for (var ${GEN.nestedIdx}${sk}=0; ${GEN.nestedIdx}${sk}<${GEN.result}${sk}.length; ${GEN.nestedIdx}${sk}++) {\n`;
          code +=
            `      ` +
            nestedErrPush(
              GEN.errList,
              `${ppVar}+${GEN.result}${sk}[${GEN.nestedIdx}${sk}].path`,
              `${GEN.result}${sk}[${GEN.nestedIdx}${sk}]`,
              `__ne${sk}`,
            );
          code += `      }\n`;
        } else {
          code += `      ` + nestedErrReturn(`${ppVar}+${GEN.result}${sk}[0].path`, `${GEN.result}${sk}[0]`, `__ne${sk}`, true);
        }
        code += `    }\n`;
      }

      code += `  }\n`;
      code += `} else { ${emitCtx.fail('isArray')}; }\n`;
    } else {
      // Single nested object — arrays are objects by `typeof` but are not valid nested DTOs;
      // reject them here (matching the deserialize path) instead of descending into their fields.
      code += `if (${varName} != null && typeof ${varName} === 'object' && !Array.isArray(${varName})) {\n`;

      if (useInline) {
        const ppExpr = ctx.pathPrefix ? `${ctx.pathPrefix}+${JSON.stringify(fieldKey + '.')}` : JSON.stringify(fieldKey + '.');
        const vpPrefix = `${sk}_`;
        code += emitInlineNestedBlock(nestedMerged!, nestedCls, varName, ppExpr, vpPrefix, ctx);
      } else {
        const execIdx = execs.length;
        execs.push(nestedSealed);
        const awaitKw = ctx.isAsync ? 'await ' : '';
        code += `  var ${GEN.result}${sk} = ${awaitKw}execs[${execIdx}].validate(${varName}, opts);\n`;
        code += generateValidateNestedResult(fieldKey, `${GEN.result}${sk}`, collectErrors, ctx.pathPrefix);
      }

      code += `} else { ${emitCtx.fail('isObject')}; }\n`;
    }
  }
  return code;
}

/** Generate validate-mode nested result handling (null check instead of isErr) */
function generateValidateNestedResult(fieldKey: string, resultVar: string, collectErrors: boolean, pathPrefix?: string): string {
  const sk = sanitizeKey(fieldKey);
  const ppVar = `__bk$pp${sk}`;
  // Prepend the current scope's path prefix (see generateNestedResultCode).
  const ppValue = pathPrefix ? `${pathPrefix}+${JSON.stringify(fieldKey + '.')}` : JSON.stringify(fieldKey + '.');
  if (collectErrors) {
    const errItem = `${resultVar}[${GEN.nestedIdx}${sk}]`;
    return (
      `  if (${resultVar} !== null) {\n` +
      `    var ${ppVar} = ${ppValue};\n` +
      `    for (var ${GEN.nestedIdx}${sk}=0; ${GEN.nestedIdx}${sk}<${resultVar}.length; ${GEN.nestedIdx}${sk}++) {\n` +
      `      ` +
      nestedErrPush(GEN.errList, `${ppVar}+${errItem}.path`, errItem, `__ne${sk}`) +
      `    }\n` +
      `  }\n`
    );
  }
  const errFirst = `${resultVar}[0]`;
  return (
    `  if (${resultVar} !== null) {\n` +
    `    var ${ppVar} = ${ppValue};\n` +
    `    ` +
    nestedErrReturn(`${ppVar}+${errFirst}.path`, errFirst, `__ne${sk}`, true) +
    `  }\n`
  );
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

  if (!ctx.inlineNestedClasses) {
    ctx.inlineNestedClasses = new Set();
  }

  // Resolve nested DTO for collection values
  let nestedCls: Function | undefined;
  let nestedSealed: SealedExecutors<unknown> | undefined;
  let nestedMerged: RawClassMeta | undefined;
  if (meta.type!.resolvedCollectionValue) {
    nestedCls = meta.type!.resolvedCollectionValue;
    nestedSealed = ctx.resolve(nestedCls) as SealedExecutors<unknown>;
    nestedMerged = nestedSealed.merged;
  }
  const useInline = nestedCls && nestedMerged && !ctx.inlineNestedClasses.has(nestedCls);

  let code = '';

  if (collection === CollectionType.Set) {
    code += `if (Array.isArray(${varName})) {\n`;
    const nonEachRules = meta.validation.filter(rd => !rd.each);
    code += emitRuleList(fieldKey, varName, nonEachRules, emitCtx, ctx, '  ');

    if (nestedSealed) {
      const iVar = `${GEN.index}${sk}`;
      code += `  for (var ${iVar}=0; ${iVar}<${varName}.length; ${iVar}++) {\n`;

      if (useInline) {
        // Cache per-iteration path prefix into a single local var — itemInvalidPathExpr was
        // identical to ppExpr (two copies of the same 3-string concat in the emitted body).
        const itemVar = `__il$${sk}ci`;
        const ppVar = `__bk$pp${sk}`;
        const ppInit = ctx.pathPrefix
          ? `${ctx.pathPrefix}+${JSON.stringify(fieldKey)}+'['+${iVar}+'].'`
          : `${JSON.stringify(fieldKey)}+'['+${iVar}+'].'`;
        const vpPrefix = `${sk}c_`;
        code += `    var ${itemVar} = ${varName}[${iVar}];\n`;
        code += `    var ${ppVar} = ${ppInit};\n`;
        code += `    if (${itemVar} == null || typeof ${itemVar} !== 'object' || Array.isArray(${itemVar})) `;
        if (collectErrors) {
          code += `${GEN.errList}.push({path:${ppVar},code:'invalidInput'});\n`;
        } else {
          code += `return [{path:${ppVar},code:'invalidInput'}];\n`;
        }
        code += `    else {\n`;
        code += emitInlineNestedBlock(nestedMerged!, nestedCls!, itemVar, ppVar, vpPrefix, ctx);
        code += `    }\n`;
      } else {
        const execIdx = execs.length;
        execs.push(nestedSealed);
        code += `    var ${GEN.result}${sk} = ${awaitKw}execs[${execIdx}].validate(${varName}[${iVar}], opts);\n`;
        code += `    if (${GEN.result}${sk} !== null) {\n`;
        const ppVar = `__bk$pp${sk}`;
        const ppInit = ctx.pathPrefix
          ? `${ctx.pathPrefix}+${JSON.stringify(fieldKey)}+'['+${iVar}+'].'`
          : `${JSON.stringify(fieldKey)}+'['+${iVar}+'].'`;
        code += `      var ${ppVar} = ${ppInit};\n`;
        if (collectErrors) {
          code += `      for (var ${GEN.nestedIdx}${sk}=0; ${GEN.nestedIdx}${sk}<${GEN.result}${sk}.length; ${GEN.nestedIdx}${sk}++) {\n`;
          code +=
            `      ` +
            nestedErrPush(
              GEN.errList,
              `${ppVar}+${GEN.result}${sk}[${GEN.nestedIdx}${sk}].path`,
              `${GEN.result}${sk}[${GEN.nestedIdx}${sk}]`,
              `__ne${sk}`,
            );
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
      const eiVar = `${GEN.index}${sk}e`;
      code += `  for (var ${eiVar}=0; ${eiVar}<${varName}.length; ${eiVar}++) {\n`;
      for (const rd of eachRules) {
        const prefixVar = `__bk$ep_${sk}`;
        const extra = computeRuleExtras(rd, fieldKey, varName, ctx);
        const failFn = (c: string) =>
          collectErrors
            ? `${GEN.errList}.push({path:${prefixVar}+${eiVar}+']',code:${JSON.stringify(c)}${extra}})`
            : `return [{path:${prefixVar}+${eiVar}+']',code:${JSON.stringify(c)}${extra}}]`;
        const colEmitCtx: EmitContext = { ...emitCtx, fail: failFn };
        if (!code.includes(`var ${prefixVar}`)) {
          const prefixInit = ctx.pathPrefix
            ? `${ctx.pathPrefix}+${JSON.stringify(fieldKey)}+'['`
            : `${JSON.stringify(fieldKey)}+'['`;
          code += `  var ${prefixVar} = ${prefixInit};\n`;
        }
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
      const ksVar = `__bk$vk${sk}`;
      const iVar = `__bk$vi${sk}`;
      code += `  var ${ksVar} = Object.keys(${varName});\n`;
      code += `  for (var ${iVar}=0; ${iVar}<${ksVar}.length; ${iVar}++) {\n`;
      code += `    var ${kVar} = ${ksVar}[${iVar}];\n`;

      if (useInline) {
        const itemVar = `__il$${sk}mi`;
        const ppExpr = ctx.pathPrefix
          ? `${ctx.pathPrefix}+${JSON.stringify(fieldKey)}+'['+${kVar}+'].'`
          : `${JSON.stringify(fieldKey)}+'['+${kVar}+'].'`;
        const vpPrefix = `${sk}m_`;
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
        code += `    var ${GEN.result}${sk} = ${awaitKw}execs[${execIdx}].validate(${varName}[${kVar}], opts);\n`;
        code += `    if (${GEN.result}${sk} !== null) {\n`;
        const ppVar = `__bk$pp${sk}`;
        const ppInit = ctx.pathPrefix
          ? `${ctx.pathPrefix}+${JSON.stringify(fieldKey)}+'['+${kVar}+'].'`
          : `${JSON.stringify(fieldKey)}+'['+${kVar}+'].'`;
        code += `      var ${ppVar} = ${ppInit};\n`;
        if (collectErrors) {
          code += `      for (var ${GEN.nestedIdx}${sk}=0; ${GEN.nestedIdx}${sk}<${GEN.result}${sk}.length; ${GEN.nestedIdx}${sk}++) {\n`;
          code +=
            `      ` +
            nestedErrPush(
              GEN.errList,
              `${ppVar}+${GEN.result}${sk}[${GEN.nestedIdx}${sk}].path`,
              `${GEN.result}${sk}[${GEN.nestedIdx}${sk}]`,
              `__ne${sk}`,
            );
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

function makeEmitCtx(fieldKey: string, ctx: FieldCodeContext, fieldExtras = ''): EmitContext {
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
        return `${GEN.errList}.push({path:${pathExpr},code:${JSON.stringify(code)}${fieldExtras}})`;
      } else if (validateOnly) {
        return `return [{path:${pathExpr},code:${JSON.stringify(code)}${fieldExtras}}]`;
      }
      return `return err([{path:${pathExpr},code:${JSON.stringify(code)}${fieldExtras}}])`;
    },
    collectErrors,
    pathExpr: pathExpr,
  };
}
export { buildDeserializeCode, buildValidateCode };
