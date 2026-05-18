import type { SealOptions, RuntimeOptions } from '../interfaces';
import type { RawClassMeta, RawPropertyMeta, SealedExecutors, TransformDef } from '../types';

import { getSealed } from '../meta-access';
import { sanitizeKey, buildGroupsHasExpr } from './codegen-utils';

// ─────────────────────────────────────────────────────────────────────────────
// Generated variable name prefixes — centralised to prevent typo-related bugs
// ─────────────────────────────────────────────────────────────────────────────

const GEN = {
  out: '__bk$out',
  fieldVal: '__bk$fv_',
  groups: '__bk$groups',
  group0: '__bk$group0',
  groupsSet: '__bk$groupsSet',
  setArr: '__bk$sa',
  setItem: '__bk$si',
  mapObj: '__bk$m',
  mapEntry: '__bk$me',
  serResult: '__bk$sr',
  outItem: '__bk$out_item',
  discArr: '__bk$da',
  discIdx: '__bk$di',
  nestedArr: '__bk$na',
  nestedIdx: '__bk$ni',
  nestedItem: '__bk$nitem',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Determine the output key for serialize direction */
function getSerializeOutputKey(fieldKey: string, exposeStack: RawPropertyMeta['expose']): string {
  // serializeOnly @Expose with name → use that name
  const serDef = exposeStack.find(e => e.serializeOnly && e.name);
  if (serDef) {
    return serDef.name!;
  }
  // Non-directional @Expose with name → use for both directions
  const biDef = exposeStack.find(e => !e.deserializeOnly && !e.serializeOnly && e.name);
  if (biDef) {
    return biDef.name!;
  }
  return fieldKey;
}

/** Determine expose groups for serialize direction — returns undefined (no restriction) if any unconditional expose entry exists */
function getSerializeExposeGroups(exposeStack: RawPropertyMeta['expose']): string[] | undefined {
  // Single-pass: scan once, build set of groups; bail out as soon as we see an unconditional entry.
  let all: Set<string> | null = null;
  for (const e of exposeStack) {
    if (e.deserializeOnly) {
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

/**
 * Build serialize-direction transform expression.
 * Serialize direction reverses declaration order (codec stack unwrapping).
 */
function buildSerializeTransformExpr(
  inputExpr: string,
  fieldKey: string,
  serTransforms: TransformDef[],
  refs: unknown[],
): string | null {
  if (serTransforms.length === 0) {
    return null;
  }
  if (serTransforms.length === 1) {
    const td = serTransforms[0]!;
    const refIdx = refs.length;
    refs.push(td.fn);
    const callExpr = `refs[${refIdx}]({value:${inputExpr},key:${JSON.stringify(fieldKey)},obj:instance})`;
    return td.isAsync ? `(await ${callExpr})` : callExpr;
  }
  if (serTransforms.length === 2) {
    const td1 = serTransforms[1]!;
    const td0 = serTransforms[0]!;
    const refIdx1 = refs.length;
    refs.push(td1.fn);
    const refIdx0 = refs.length;
    refs.push(td0.fn);
    const call1 = `refs[${refIdx1}]({value:${inputExpr},key:${JSON.stringify(fieldKey)},obj:instance})`;
    const expr1 = td1.isAsync ? `(await ${call1})` : call1;
    const call0 = `refs[${refIdx0}]({value:${expr1},key:${JSON.stringify(fieldKey)},obj:instance})`;
    return td0.isAsync ? `(await ${call0})` : call0;
  }

  // Walk serTransforms backwards in place — avoids [...arr].reverse() clone allocation
  let valueExpr = inputExpr;
  for (let k = serTransforms.length - 1; k >= 0; k -= 1) {
    const td = serTransforms[k]!;
    const refIdx = refs.length;
    refs.push(td.fn);
    const callExpr = `refs[${refIdx}]({value:${valueExpr},key:${JSON.stringify(fieldKey)},obj:instance})`;
    valueExpr = td.isAsync ? `(await ${callExpr})` : callExpr;
  }
  return valueExpr;
}

/**
 * Generate transform chain code to apply after nested/collection serialize.
 * Reads the current value from outputTarget, chains transforms, writes back.
 */
function buildPostNestedTransformCode(
  outputTarget: string,
  fieldKey: string,
  serTransforms: TransformDef[],
  refs: unknown[],
): string {
  const transformed = buildSerializeTransformExpr(outputTarget, fieldKey, serTransforms, refs);
  return transformed ? `\n${outputTarget} = ${transformed};` : '';
}

// ─────────────────────────────────────────────────────────────────────────────
// buildSerializeCode — new Function-based serialize executor generation (§4.3 serialize pipeline)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate serialize executor code.
 * Assumes no validation — always returns Record<string, unknown> (§4.3).
 */
function buildSerializeCode<T>(
  Class: Function,
  merged: RawClassMeta,
  options: SealOptions | undefined,
  isAsync: boolean,
): (instance: T, opts?: RuntimeOptions) => Record<string, unknown> | Promise<Record<string, unknown>> {
  const refs: unknown[] = [];
  const execs: SealedExecutors<unknown>[] = [];

  // ── Code generation ────────────────────────────────────────────────────────

  let body = "'use strict';\n";
  body += `var ${GEN.out} = {};\n`;

  // Groups variable — only when fields referencing groups exist
  const hasGroupsField = Object.values(merged).some(meta => {
    const groups = getSerializeExposeGroups(meta.expose);
    return groups && groups.length > 0;
  });
  if (hasGroupsField) {
    body += `var ${GEN.groups} = opts && opts.groups;\n`;
    body += `var ${GEN.group0} = ${GEN.groups} && ${GEN.groups}.length === 1 ? ${GEN.groups}[0] : null;\n`;
    body += `var ${GEN.groupsSet} = ${GEN.groups} && ${GEN.groups}.length > 1 ? new Set(${GEN.groups}) : null;\n`;
  }

  for (const [fieldKey, meta] of Object.entries(merged)) {
    body += generateSerializeFieldCode(fieldKey, meta, refs, execs, isAsync, options, Class.name);
  }

  body += `return ${GEN.out};\n`;

  // sourceURL (§4.9)
  // Sanitize class name so it cannot inject newlines / */ that would break out of the comment.
  const safeClsName = Class.name.replace(/[^\w$.-]/g, '_');
  body += `//# sourceURL=baker://${safeClsName}/serialize\n`;

  // ── Execute new Function ───────────────────────────────────────────────────

  const fnKeyword = isAsync ? 'async function' : 'function';
  const executor = new Function('refs', 'execs', `return ${fnKeyword}(instance, opts) { ` + body + ' }')(refs, execs) as (
    instance: T,
    opts?: RuntimeOptions,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;

  return executor;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-field serialize code generation
// ─────────────────────────────────────────────────────────────────────────────

function generateSerializeFieldCode(
  fieldKey: string,
  meta: RawPropertyMeta,
  refs: unknown[],
  execs: SealedExecutors<unknown>[],
  isAsync: boolean,
  options?: SealOptions,
  className: string = '',
): string {
  // ⓪ Exclude serializeOnly / bidirectional → skip
  if (meta.exclude) {
    if (!meta.exclude.deserializeOnly) {
      if (options?.debug) {
        const reason = meta.exclude.serializeOnly ? 'serializeOnly' : 'bidirectional';
        return `// [baker] field "${fieldKey}" excluded (${reason} @Exclude)\n`;
      }
      return '';
    }
  }

  // Expose: if all @Expose entries are deserializeOnly, skip for serialize
  if (meta.expose.length > 0 && meta.expose.every(e => e.deserializeOnly)) {
    if (options?.debug) {
      return `// [baker] field "${fieldKey}" excluded (all @Expose entries are deserializeOnly)\n`;
    }
    return '';
  }

  const outputKey = getSerializeOutputKey(fieldKey, meta.expose);
  const exposeGroups = getSerializeExposeGroups(meta.expose);
  const sk = sanitizeKey(fieldKey);
  const fieldVal = `${GEN.fieldVal}${sk}`;

  let fieldCode = '';
  fieldCode += `var ${fieldVal} = instance[${JSON.stringify(fieldKey)}];\n`;

  // groups check wrap (§4.5)
  let fieldStart = '';
  let fieldEnd = '';
  if (exposeGroups && exposeGroups.length > 0) {
    fieldStart = `if ((${GEN.group0} !== null || ${GEN.groupsSet}) && (${buildGroupsHasExpr(GEN.group0, GEN.groupsSet, exposeGroups)})) {\n`;
    fieldEnd = '}\n';
  }

  let innerCode = '';

  // ② @IsOptional → skip output if undefined (§4.3 serialize step 2)
  const useOptionalGuard = meta.flags.isOptional;

  // Collect serialize-direction transforms once
  const serTransforms = meta.transform.filter(td => !td.options?.deserializeOnly);

  // ③a Collection (Map/Set) serialize — Set → Array, Map → plain object
  if (meta.type?.collection) {
    const outputTarget = `${GEN.out}[${JSON.stringify(outputKey)}]`;
    const collection = meta.type.collection;
    let nestedCode: string;

    if (collection === 'Set') {
      if (meta.type.resolvedCollectionValue) {
        const nestedSealed = getSealed(meta.type.resolvedCollectionValue) as SealedExecutors<unknown>;
        const execIdx = execs.length;
        execs.push(nestedSealed);
        if (isAsync) {
          nestedCode = `{ var __ser_ps = []; for (var __ser_item of ${fieldVal}) { __ser_ps.push(__ser_item == null ? __ser_item : execs[${execIdx}].serialize(__ser_item, opts)); } ${outputTarget} = await Promise.all(__ser_ps); }`;
        } else {
          nestedCode = `var ${GEN.setArr} = [];\n`;
          nestedCode += `  for (var ${GEN.setItem} of ${fieldVal}) {\n`;
          nestedCode += `    ${GEN.setArr}.push(${GEN.setItem} == null ? ${GEN.setItem} : execs[${execIdx}].serialize(${GEN.setItem}, opts));\n`;
          nestedCode += `  }\n`;
          nestedCode += `  ${outputTarget} = ${GEN.setArr};`;
        }
      } else {
        nestedCode = `${outputTarget} = [...${fieldVal}];`;
      }
    } else {
      // Map → plain object (W8: keys must be strings — throw otherwise)
      const keyCheck = `if (typeof ${GEN.mapEntry}[0] !== 'string') { throw new TypeError(${JSON.stringify(className)} + ': Map field ' + ${JSON.stringify(fieldKey)} + ' has non-string key (' + typeof ${GEN.mapEntry}[0] + '). Map serialization requires string keys.'); }\n    `;
      if (meta.type.resolvedCollectionValue) {
        const nestedSealed = getSealed(meta.type.resolvedCollectionValue) as SealedExecutors<unknown>;
        const execIdx = execs.length;
        execs.push(nestedSealed);
        const awaitKw = isAsync ? 'await ' : '';
        nestedCode = `var ${GEN.mapObj} = {};\n`;
        nestedCode += `  for (var ${GEN.mapEntry} of ${fieldVal}) {\n`;
        nestedCode += `    ${keyCheck}`;
        nestedCode += `${GEN.mapObj}[${GEN.mapEntry}[0]] = ${GEN.mapEntry}[1] == null ? ${GEN.mapEntry}[1] : ${awaitKw}execs[${execIdx}].serialize(${GEN.mapEntry}[1], opts);\n`;
        nestedCode += `  }\n`;
        nestedCode += `  ${outputTarget} = ${GEN.mapObj};`;
      } else {
        nestedCode = `var ${GEN.mapObj} = {};\n`;
        nestedCode += `  for (var ${GEN.mapEntry} of ${fieldVal}) {\n`;
        nestedCode += `    ${keyCheck}`;
        nestedCode += `${GEN.mapObj}[${GEN.mapEntry}[0]] = ${GEN.mapEntry}[1];\n`;
        nestedCode += `  }\n`;
        nestedCode += `  ${outputTarget} = ${GEN.mapObj};`;
      }
    }

    // Apply serialize transforms after collection serialize (nested → transform)
    nestedCode += buildPostNestedTransformCode(outputTarget, fieldKey, serTransforms, refs);

    if (useOptionalGuard) {
      innerCode = `if (${fieldVal} !== undefined && ${fieldVal} !== null) {\n  ${nestedCode}\n} else if (${fieldVal} === null) {\n  ${outputTarget} = null;\n}\n`;
    } else {
      innerCode = `if (${fieldVal} != null) {\n  ${nestedCode}\n} else {\n  ${outputTarget} = ${fieldVal};\n}\n`;
    }

    fieldCode += fieldStart + innerCode + fieldEnd;
    return fieldCode;
  }

  // ③b nested @Type handling (H4) — supports type + transform combination (nested serialize → transform)
  if (meta.type?.resolvedClass || meta.type?.discriminator || (meta.type?.fn && meta.flags.validateNested)) {
    // Determine array/each mode
    const hasEach = meta.type?.isArray || meta.flags.validateNestedEach || meta.validation.some(rd => rd.each);
    const outputTarget = `${GEN.out}[${JSON.stringify(outputKey)}]`;

    let nestedCode: string;

    if (meta.type!.discriminator) {
      // §C-8 discriminator serialize — instanceof dispatch
      const { property, subTypes } = meta.type!.discriminator;
      const keepDisc = meta.type!.keepDiscriminatorProperty !== false; // default true for round-trip

      // Sort most-specific-first (subclasses take priority in inheritance relationships)
      const sorted = [...subTypes].sort((a, b) => {
        if ((a.value as Function).prototype instanceof b.value) {
          return -1;
        }
        if ((b.value as Function).prototype instanceof a.value) {
          return 1;
        }
        return 0;
      });

      // Helper for generating instanceof branch code
      const buildInstanceofChain = (itemVar: string, awaitKw: string): string => {
        let code = '';
        for (let i = 0; i < sorted.length; i++) {
          const sub = sorted[i]!;
          const nestedSealed = getSealed(sub.value) as SealedExecutors<unknown>;
          const execIdx = execs.length;
          execs.push(nestedSealed);
          const refIdx = refs.length;
          refs.push(sub.value);
          const prefix = i === 0 ? 'if' : '} else if';
          code += `${prefix} (${itemVar} instanceof refs[${refIdx}]) {\n`;
          code += `  var ${GEN.serResult} = ${awaitKw}execs[${execIdx}].serialize(${itemVar}, opts);\n`;
          if (keepDisc) {
            code += `  ${GEN.serResult}[${JSON.stringify(property)}] = ${JSON.stringify(sub.name)};\n`;
          }
          code += `  ${GEN.outItem} = ${GEN.serResult};\n`;
        }
        code += `} else { ${GEN.outItem} = ` + itemVar + '; }\n';
        return code;
      };

      if (hasEach) {
        const awaitKw = isAsync ? 'await ' : '';
        if (isAsync) {
          nestedCode = `${outputTarget} = await Promise.all(${fieldVal}.map(async function(__ser_item) {\n`;
        } else {
          nestedCode = `var ${GEN.discArr} = [];\n`;
          nestedCode += `  for (var ${GEN.discIdx}=0; ${GEN.discIdx}<${fieldVal}.length; ${GEN.discIdx}++) {\n`;
          nestedCode += `    var __ser_item = ${fieldVal}[${GEN.discIdx}];\n`;
        }
        nestedCode += `    var ${GEN.outItem};\n`;
        nestedCode += buildInstanceofChain('__ser_item', awaitKw);
        if (isAsync) {
          nestedCode += `  return ${GEN.outItem};\n`;
          nestedCode += `}));`;
        } else {
          nestedCode += `    ${GEN.discArr}.push(${GEN.outItem});\n`;
          nestedCode += `  }\n`;
          nestedCode += `  ${outputTarget} = ${GEN.discArr};`;
        }
      } else {
        const awaitKw = isAsync ? 'await ' : '';
        nestedCode = `var ${GEN.outItem};\n`;
        nestedCode += buildInstanceofChain(fieldVal, awaitKw);
        nestedCode += `${outputTarget} = ${GEN.outItem};`;
      }
    } else {
      // Existing simple nested logic
      const nestedCls = meta.type!.resolvedClass ?? (meta.type!.fn() as Function);
      const nestedSealed = getSealed(nestedCls) as SealedExecutors<unknown>;
      const execIdx = execs.length;
      execs.push(nestedSealed);

      if (hasEach) {
        if (isAsync) {
          nestedCode = `${outputTarget} = await Promise.all(${fieldVal}.map(async function(__ser_item) { return __ser_item == null ? __ser_item : await execs[${execIdx}].serialize(__ser_item, opts); }));`;
        } else {
          nestedCode = `var ${GEN.nestedArr} = [];\n`;
          nestedCode += `  for (var ${GEN.nestedIdx}=0; ${GEN.nestedIdx}<${fieldVal}.length; ${GEN.nestedIdx}++) {\n`;
          nestedCode += `    var ${GEN.nestedItem} = ${fieldVal}[${GEN.nestedIdx}];\n`;
          nestedCode += `    ${GEN.nestedArr}.push(${GEN.nestedItem} == null ? ${GEN.nestedItem} : execs[${execIdx}].serialize(${GEN.nestedItem}, opts));\n`;
          nestedCode += `  }\n`;
          nestedCode += `  ${outputTarget} = ${GEN.nestedArr};`;
        }
      } else {
        const awaitKw = isAsync ? 'await ' : '';
        nestedCode = `${outputTarget} = ${awaitKw}execs[${execIdx}].serialize(${fieldVal}, opts);`;
      }
    }

    // Apply serialize transforms after nested serialize (nested serialize → transform)
    nestedCode += buildPostNestedTransformCode(outputTarget, fieldKey, serTransforms, refs);

    if (useOptionalGuard) {
      innerCode = `if (${fieldVal} !== undefined && ${fieldVal} !== null) {\n  ${nestedCode}\n} else if (${fieldVal} === null) {\n  ${outputTarget} = null;\n}\n`;
    } else {
      innerCode = `if (${fieldVal} != null) {\n  ${nestedCode}\n} else {\n  ${outputTarget} = ${fieldVal};\n}\n`;
    }
  } else {
    // Existing @Transform or direct assign handling
    const outputExpr = buildSerializeOutputExpr(fieldKey, outputKey, fieldVal, meta, refs);

    if (useOptionalGuard) {
      innerCode += `if (${fieldVal} !== undefined) {\n`;
      innerCode += '  ' + outputExpr + '\n';
      innerCode += '}\n';
    } else {
      innerCode += outputExpr + '\n';
    }
  }

  fieldCode += fieldStart + innerCode + fieldEnd;
  return fieldCode;
}

/**
 * Build field output expression.
 * If @Transform exists, call refs[i](params); otherwise, direct assignment.
 */
function buildSerializeOutputExpr(
  fieldKey: string,
  outputKey: string,
  fieldValueExpr: string,
  meta: RawPropertyMeta,
  refs: unknown[],
): string {
  const outputTarget = `${GEN.out}[${JSON.stringify(outputKey)}]`;

  const serTransforms = meta.transform.filter(td => !td.options?.deserializeOnly);

  if (serTransforms.length > 0) {
    const transformed = buildSerializeTransformExpr(fieldValueExpr, fieldKey, serTransforms, refs)!;
    return `${outputTarget} = ${transformed};`;
  }

  return `${outputTarget} = ${fieldValueExpr};`;
}
export { buildSerializeCode };
