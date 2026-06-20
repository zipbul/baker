import type { RawPropertyMeta, RuleDef } from '../metadata';
import type { EmitContext } from '../rules/types';

import { BakerError } from '../common';
import { sanitizeKey, buildGroupsHasExpr } from './codegen-utils';
import { GuardKey } from './enums';

// ─────────────────────────────────────────────────────────────────────────────
// Generated variable name prefixes — centralised to prevent typo-related bugs
// ─────────────────────────────────────────────────────────────────────────────

export const GEN = {
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
// Helpers — code generation utilities (pure, module-level)
// ─────────────────────────────────────────────────────────────────────────────

/** Generate nested error push code that propagates message/context fields */
export function nestedErrPush(errList: string, pathExpr: string, errItemExpr: string, tmpVar: string): string {
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
export function nestedErrReturn(pathExpr: string, errItemExpr: string, tmpVar: string, validateOnly?: boolean): string {
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
export function toVarName(key: string, prefix?: string): string {
  return GEN.field + (prefix || '') + sanitizeKey(key);
}

/** Determine the extraction key for deserialization (§4.3 step 3) */
export function getDeserializeExtractKey(fieldKey: string, exposeStack: RawPropertyMeta['expose']): string {
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
export function getDeserializeExposeGroups(exposeStack: RawPropertyMeta['expose']): string[] | undefined {
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
// nullable/optional guard — truth-table strategy pattern (D-3)
// ─────────────────────────────────────────────────────────────────────────────

export function resolveGuardKey(isNullable: boolean, useOptionalGuard: boolean, isDefined: boolean): GuardKey {
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

export interface GuardParams {
  varName: string;
  emitCtx: EmitContext;
  assignNull: string;
  validationCode: string;
}

export const GUARD_STRATEGIES: Record<GuardKey, (p: GuardParams) => string> = {
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
// wrapGroupsGuard — per-rule validation groups check wrapper (§M4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * When rd.groups is set, only execute code if there is an intersection with runtime __bk$groups.
 * Rules without groups always execute (preserves existing behavior).
 */
export function wrapGroupsGuard(rd: RuleDef, code: string): string {
  if (!rd.groups || rd.groups.length === 0) {
    return code;
  }
  return `if ((${GEN.group0} === null && !${GEN.groupsSet}) || ${buildGroupsHasExpr(GEN.group0, GEN.groupsSet, rd.groups)}) {\n${code}\n}\n`;
}

export function sameGroups(a?: string[], b?: string[]): boolean {
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

export function generateConversionCode(
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
export const PRIMITIVE_TYPE_HINTS: Record<string, string> = {
  Number: 'number',
  Boolean: 'boolean',
  String: 'string',
  Date: 'date',
};

/** Asserter rule name → gate type mapping */
export const ASSERTER_TO_GATE: Record<string, string> = {
  isString: 'string',
  isNumber: 'number',
  isBoolean: 'boolean',
  isDate: 'date',
  isInt: 'number',
  isArray: 'array',
  isObject: 'object',
};

/** Asserters whose gate check fully subsumes the rule (skip emit inside gate) */
export const GATE_ONLY_ASSERTERS = new Set(['isString', 'isBoolean', 'isDate', 'isArray', 'isObject']);

/** Result of categorizeRules — each/nonEach split and typed dependency classification */
export interface CategorizedRules {
  each: RuleDef[];
  generalRules: RuleDef[];
  /** The single typed dependency group (if any) after conflict check */
  typedDeps: { type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object'; deps: RuleDef[] } | undefined;
}

/** categorizeRules — separate each/nonEach rules, detect mixed gate conflicts (pure) */
export function categorizeRules(fieldKey: string, validation: RawPropertyMeta['validation']): CategorizedRules {
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
export interface ResolvedTypeGate {
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

/** Config object for emitTypedRules — bundles closure-captured vars into explicit parameter */
export interface TypeGateConfig {
  effectiveGateType: string;
  gateCondition: string;
  gateErrorCode: string;
  gateEmitCtx: EmitContext;
  otherGeneral: RuleDef[];
  gateDeps: RuleDef[];
  typeAsserter: RuleDef | undefined;
  enableConversion: boolean;
}

/** Generate nested-result handling for deserialize mode (pure) */
export function generateNestedResultCode(fieldKey: string, resultVar: string, collectErrors: boolean, pathPrefix?: string): string {
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

/** Generate validate-mode nested result handling (null check instead of isErr) (pure) */
export function generateValidateNestedResult(fieldKey: string, resultVar: string, collectErrors: boolean, pathPrefix?: string): string {
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
