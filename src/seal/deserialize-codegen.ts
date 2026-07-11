import type { RawPropertyMeta, RuleDef } from '../metadata';
import type { EmitContext } from '../rules';
import type { CategorizedRules } from './interfaces';

import { BakerError } from '../common';
import { sanitizeKey, buildGroupsHasExpr } from './codegen-utils';
import { DES_GEN as GEN } from './constants';
import { GuardKey } from './enums';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — code generation utilities (pure, module-level)
// ─────────────────────────────────────────────────────────────────────────────

/** Generate nested error push code that propagates message/context/constraints fields */
export function nestedErrPush(errList: string, pathExpr: string, errItemExpr: string, tmpVar: string): string {
  // Cache errItemExpr once — avoids repeated property reads in the generated body
  const eVar = `${tmpVar}_e`;
  return (
    `var ${eVar}=${errItemExpr};\n` +
    `      if(${eVar}.message===undefined&&${eVar}.context===undefined&&${eVar}.constraints===undefined){${errList}.push({path:${pathExpr},code:${eVar}.code});}\n` +
    `      else{var ${tmpVar}={path:${pathExpr},code:${eVar}.code};\n` +
    `      if(${eVar}.message!==undefined)${tmpVar}.message=${eVar}.message;\n` +
    `      if(${eVar}.context!==undefined)${tmpVar}.context=${eVar}.context;\n` +
    `      if(${eVar}.constraints!==undefined)${tmpVar}.constraints=${eVar}.constraints;\n` +
    `      ${errList}.push(${tmpVar});}\n`
  );
}

/** Generate nested error return code that propagates message/context/constraints fields */
export function nestedErrReturn(pathExpr: string, errItemExpr: string, tmpVar: string, validateOnly?: boolean): string {
  const ret = (arr: string) => (validateOnly ? `return ${arr};\n` : `return err(${arr});\n`);
  // Cache errItemExpr once — mirrors nestedErrPush, avoids repeated property reads in the generated body.
  const eVar = `${tmpVar}_e`;
  return (
    `var ${eVar}=${errItemExpr};\n` +
    `    if(${eVar}.message===undefined&&${eVar}.context===undefined&&${eVar}.constraints===undefined)${ret(`[{path:${pathExpr},code:${eVar}.code}]`)}` +
    `    var ${tmpVar}={path:${pathExpr},code:${eVar}.code};\n` +
    `    if(${eVar}.message!==undefined)${tmpVar}.message=${eVar}.message;\n` +
    `    if(${eVar}.context!==undefined)${tmpVar}.context=${eVar}.context;\n` +
    `    if(${eVar}.constraints!==undefined)${tmpVar}.constraints=${eVar}.constraints;\n` +
    `    ${ret(`[${tmpVar}]`)}`
  );
}

/** Convert field name to a safe JS variable name (includes prefix to prevent internal variable collisions) */
export function toVarName(key: string, prefix?: string): string {
  return GEN.field + (prefix || '') + sanitizeKey(key);
}

// Field rename + expose-group resolution (both directions) live in codegen-utils as the single
// source of truth — see resolveExposeName / resolveExposeGroups.

// ─────────────────────────────────────────────────────────────────────────────
// nullable/optional guard — truth-table strategy pattern (D-3)
// ─────────────────────────────────────────────────────────────────────────────

export function resolveGuardKey(isNullable: boolean, useOptionalGuard: boolean): GuardKey {
  if (isNullable && useOptionalGuard) {
    return GuardKey.NullableOptional;
  }
  if (isNullable) {
    return GuardKey.Nullable;
  }
  if (useOptionalGuard) {
    return GuardKey.Optional;
  }
  return GuardKey.Default;
}

// GuardParams and TypeGateConfig stay in this internal (non-barrel) module rather than seal/interfaces.ts:
// both reference rules' EmitContext, and seal/interfaces.ts is imported by rules/interfaces.ts (for
// EmitContext.addExecutor → SealedExecutors), so housing them in the barrel-exported file would close a
// rules ↔ seal cycle. The rules-free codegen types (CategorizedRules/ResolvedTypeGate) live in interfaces.ts.
export interface GuardParams {
  varName: string;
  emitCtx: EmitContext;
  assignNull: string;
  validationCode: string;
}

export const GUARD_STRATEGIES: Record<GuardKey, (p: GuardParams) => string> = {
  // Case 4: nullable + optional — assign null, skip undefined
  [GuardKey.NullableOptional]({ varName, assignNull, validationCode }) {
    let code = `if (${varName} === null) { ${assignNull}}\n`;
    code += `else if (${varName} !== undefined) {\n`;
    code += validationCode;
    code += '}\n';
    return code;
  },
  // Case 3: nullable — reject undefined, assign and accept null
  [GuardKey.Nullable]({ varName, emitCtx, assignNull, validationCode }) {
    let code = `if (${varName} === undefined) ${emitCtx.fail('isDefined')};\n`;
    code += `else if (${varName} !== null) {\n`;
    code += validationCode;
    code += `} else { ${assignNull}}\n`;
    return code;
  },
  // Case 2: optional — skip entirely on undefined/null
  [GuardKey.Optional]({ varName, validationCode }) {
    let code = `if (${varName} !== undefined && ${varName} !== null) {\n`;
    code += validationCode;
    code += '}\n';
    return code;
  },
  // Case 1: no flags (default) — reject undefined/null
  [GuardKey.Default]({ varName, emitCtx, validationCode }) {
    let code = `if (${varName} === undefined || ${varName} === null) ${emitCtx.fail('isDefined')};\n`;
    code += `else {\n`;
    code += validationCode;
    code += '}\n';
    return code;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// wrapGroupsGuard — per-rule validation groups check wrapper
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

/** Result of categorizeRules — each/nonEach split and typed dependency classification */
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
export function generateNestedResultCode(
  fieldKey: string,
  resultVar: string,
  collectErrors: boolean,
  pathPrefix?: string,
): string {
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

/**
 * Nested-executor result handling inside a per-element loop (Set / Map / array / discriminator-each).
 * Single source for the `if (isErr(result)) { …re-path nested errors… } else { <success> }` block that
 * every collection loop repeats — only the element path expression (`ppExpr`), the success statement
 * (`arr.push` / `map.set` / `set.add`), and the base indent differ. The single-object case keeps using
 * {@link generateNestedResultCode} (it writes straight to `out[field]`).
 */
export function generateNestedEachResultCode(
  resultVar: string,
  ppExpr: string,
  sk: string,
  collectErrors: boolean,
  successStmt: string,
  indent: string,
): string {
  const errs = `${GEN.errors}${sk}`;
  const ppVar = `__bk$pp${sk}`;
  const decls = `${indent}  var ${errs} = ${resultVar}.data;\n${indent}  var ${ppVar} = ${ppExpr};\n`;
  let inner: string;
  if (collectErrors) {
    const ni = `${GEN.nestedIdx}${sk}`;
    inner =
      `${indent}  for (var ${ni}=0; ${ni}<${errs}.length; ${ni}++) {\n` +
      `${indent}  ` +
      nestedErrPush(GEN.errList, `${ppVar}+${errs}[${ni}].path`, `${errs}[${ni}]`, `__ne${sk}`) +
      `${indent}  }\n`;
  } else {
    inner = `${indent}  ` + nestedErrReturn(`${ppVar}+${errs}[0].path`, `${errs}[0]`, `__ne${sk}`);
  }
  return `${indent}if (isErr(${resultVar})) {\n${decls}${inner}${indent}} else { ${successStmt} }\n`;
}

/** Generate validate-mode nested result handling (null check instead of isErr) (pure) */
export function generateValidateNestedResult(
  fieldKey: string,
  resultVar: string,
  collectErrors: boolean,
  pathPrefix?: string,
): string {
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

/**
 * Validate-mode counterpart of {@link generateNestedEachResultCode}: the per-element `if (result !==
 * null) { …re-path the returned issue array… }` block shared by the Set / Map / array / discriminator
 * validate-each loops. The element path expression and base indent are the only per-site differences.
 */
export function generateValidateNestedEachResultCode(
  resultVar: string,
  ppExpr: string,
  sk: string,
  collectErrors: boolean,
  indent: string,
): string {
  const ppVar = `__bk$pp${sk}`;
  let code = `${indent}if (${resultVar} !== null) {\n${indent}  var ${ppVar} = ${ppExpr};\n`;
  if (collectErrors) {
    const ni = `${GEN.nestedIdx}${sk}`;
    code +=
      `${indent}  for (var ${ni}=0; ${ni}<${resultVar}.length; ${ni}++) {\n` +
      `${indent}  ` +
      nestedErrPush(GEN.errList, `${ppVar}+${resultVar}[${ni}].path`, `${resultVar}[${ni}]`, `__ne${sk}`) +
      `${indent}  }\n`;
  } else {
    code += `${indent}  ` + nestedErrReturn(`${ppVar}+${resultVar}[0].path`, `${resultVar}[0]`, `__ne${sk}`, true);
  }
  code += `${indent}}\n`;
  return code;
}
