import { SEALED } from '../symbols';
import { isAsyncFunction } from '../utils';
import type { RawClassMeta, RawPropertyMeta, SealedExecutors } from '../types';
import type { SealOptions, RuntimeOptions } from '../interfaces';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Determine the output key for serialize direction */
function getSerializeOutputKey(fieldKey: string, exposeStack: RawPropertyMeta['expose']): string {
  // serializeOnly @Expose with name → use that name
  const serDef = exposeStack.find(e => e.serializeOnly && e.name);
  if (serDef) return serDef.name!;
  // Non-directional @Expose with name → use for both directions
  const biDef = exposeStack.find(e => !e.deserializeOnly && !e.serializeOnly && e.name);
  if (biDef) return biDef.name!;
  return fieldKey;
}

/** Determine expose groups for serialize direction — returns undefined (no restriction) if any unconditional expose entry exists */
function getSerializeExposeGroups(exposeStack: RawPropertyMeta['expose']): string[] | undefined {
  const serEntries = exposeStack.filter(e => !e.deserializeOnly);
  if (serEntries.length === 0) return undefined;
  if (serEntries.some(e => !e.groups || e.groups.length === 0)) return undefined;
  const all = new Set<string>();
  for (const e of serEntries) for (const g of e.groups!) all.add(g);
  return [...all];
}

// ─────────────────────────────────────────────────────────────────────────────
// buildSerializeCode — new Function-based serialize executor generation (§4.3 serialize pipeline)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate serialize executor code.
 * Assumes no validation — always returns Record<string, unknown> (§4.3).
 */
export function buildSerializeCode<T>(
  Class: Function,
  merged: RawClassMeta,
  options: SealOptions | undefined,
  isAsync: boolean,
): (instance: T, opts?: RuntimeOptions) => Record<string, unknown> | Promise<Record<string, unknown>> {
  const refs: unknown[] = [];
  const execs: SealedExecutors<unknown>[] = [];

  // ── Code generation ────────────────────────────────────────────────────────

  let body = '\'use strict\';\n';
  body += 'var __bk$out = {};\n';

  // Groups variable — only when fields referencing groups exist
  const hasGroupsField = Object.values(merged).some(meta => {
    const groups = getSerializeExposeGroups(meta.expose);
    return groups && groups.length > 0;
  });
  if (hasGroupsField) {
    body += 'var __bk$groups = _opts && _opts.groups;\n';
    body += 'var __bk$groupsSet = __bk$groups ? new Set(__bk$groups) : null;\n';
  }

  for (const [fieldKey, meta] of Object.entries(merged)) {
    body += generateSerializeFieldCode(fieldKey, meta, refs, execs, isAsync, options);
  }

  body += 'return __bk$out;\n';

  // sourceURL (§4.9)
  body += `//# sourceURL=baker://${Class.name}/serialize\n`;

  // ── Execute new Function ───────────────────────────────────────────────────

  const fnKeyword = isAsync ? 'async function' : 'function';
  const executor = new Function(
    '_refs', '_execs',
    `return ${fnKeyword}(instance, _opts) { ` + body + ' }',
  )(refs, execs) as (instance: T, opts?: RuntimeOptions) => Record<string, unknown> | Promise<Record<string, unknown>>;

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

  let fieldCode = '';

  // groups check wrap (§4.5)
  let fieldStart = '';
  let fieldEnd = '';
  if (exposeGroups && exposeGroups.length > 0) {
    const groupsArr = JSON.stringify(exposeGroups);
    fieldStart = `if (__bk$groupsSet && ${groupsArr}.some(function(g){return __bk$groupsSet.has(g);})) {\n`;
    fieldEnd = '}\n';
  }

  let innerCode = '';

  // ② @IsOptional → skip output if undefined (§4.3 serialize step 2)
  const useOptionalGuard = meta.flags.isOptional;

  // ③a Collection (Map/Set) serialize — Set → Array, Map → plain object
  if (meta.type?.collection && !meta.transform.filter(td => !td.options?.deserializeOnly).length) {
    const outputTarget = `__bk$out[${JSON.stringify(outputKey)}]`;
    const collection = meta.type.collection;
    let nestedCode: string;

    if (collection === 'Set') {
      if (meta.type.resolvedCollectionValue) {
        const nestedSealed = (meta.type.resolvedCollectionValue as any)[SEALED] as SealedExecutors<unknown>;
        const execIdx = execs.length;
        execs.push(nestedSealed);
        if (isAsync) {
          nestedCode = `${outputTarget} = await Promise.all(Array.from(instance[${JSON.stringify(fieldKey)}]).map(async function(__ser_item) { return __ser_item == null ? __ser_item : await _execs[${execIdx}]._serialize(__ser_item, _opts); }));`;
        } else {
          nestedCode = `${outputTarget} = Array.from(instance[${JSON.stringify(fieldKey)}]).map(function(__ser_item) { return __ser_item == null ? __ser_item : _execs[${execIdx}]._serialize(__ser_item, _opts); });`;
        }
      } else {
        nestedCode = `${outputTarget} = Array.from(instance[${JSON.stringify(fieldKey)}]);`;
      }
    } else {
      // Map → plain object
      if (meta.type.resolvedCollectionValue) {
        const nestedSealed = (meta.type.resolvedCollectionValue as any)[SEALED] as SealedExecutors<unknown>;
        const execIdx = execs.length;
        execs.push(nestedSealed);
        const awaitKw = isAsync ? 'await ' : '';
        nestedCode = `var __bk$m = {};\n`;
        nestedCode += `  for (var __bk$me of instance[${JSON.stringify(fieldKey)}]) {\n`;
        nestedCode += `    __bk$m[__bk$me[0]] = __bk$me[1] == null ? __bk$me[1] : ${awaitKw}_execs[${execIdx}]._serialize(__bk$me[1], _opts);\n`;
        nestedCode += `  }\n`;
        nestedCode += `  ${outputTarget} = __bk$m;`;
      } else {
        nestedCode = `${outputTarget} = Object.fromEntries(instance[${JSON.stringify(fieldKey)}]);`;
      }
    }

    if (useOptionalGuard) {
      innerCode = `if (instance[${JSON.stringify(fieldKey)}] !== undefined && instance[${JSON.stringify(fieldKey)}] !== null) {\n  ${nestedCode}\n} else if (instance[${JSON.stringify(fieldKey)}] === null) {\n  ${outputTarget} = null;\n}\n`;
    } else {
      innerCode = `if (instance[${JSON.stringify(fieldKey)}] != null) {\n  ${nestedCode}\n} else {\n  ${outputTarget} = instance[${JSON.stringify(fieldKey)}];\n}\n`;
    }

    fieldCode += fieldStart + innerCode + fieldEnd;
    return fieldCode;
  }

  // ③b nested @Type handling (H4) — only when no @Transform present (§4.3 serialize pipeline)
  if ((meta.type?.resolvedClass || meta.type?.discriminator || (meta.type?.fn && meta.flags.validateNested)) && !meta.transform.filter(td => !td.options?.deserializeOnly).length) {

    // Determine array/each mode
    const hasEach = meta.type?.isArray || meta.flags.validateNestedEach || meta.validation.some(rd => rd.each);
    const outputTarget = `__bk$out[${JSON.stringify(outputKey)}]`;

    let nestedCode: string;

    if (meta.type!.discriminator) {
      // §C-8 discriminator serialize — instanceof dispatch
      const { property, subTypes } = meta.type!.discriminator;
      const keepDisc = meta.type!.keepDiscriminatorProperty !== false; // default true for round-trip

      // Sort most-specific-first (subclasses take priority in inheritance relationships)
      const sorted = [...subTypes].sort((a, b) => {
        if ((a.value as any).prototype instanceof b.value) return -1;
        if ((b.value as any).prototype instanceof a.value) return 1;
        return 0;
      });

      // Helper for generating instanceof branch code
      const buildInstanceofChain = (itemVar: string, awaitKw: string): string => {
        let code = '';
        for (let i = 0; i < sorted.length; i++) {
          const sub = sorted[i]!;
          const nestedSealed = (sub.value as any)[SEALED] as SealedExecutors<unknown>;
          const execIdx = execs.length;
          execs.push(nestedSealed);
          const refIdx = refs.length;
          refs.push(sub.value);
          const prefix = i === 0 ? 'if' : '} else if';
          code += `${prefix} (${itemVar} instanceof _refs[${refIdx}]) {\n`;
          code += `  var __bk$sr = ${awaitKw}_execs[${execIdx}]._serialize(${itemVar}, _opts);\n`;
          if (keepDisc) {
            code += `  __bk$sr[${JSON.stringify(property)}] = ${JSON.stringify(sub.name)};\n`;
          }
          code += `  __bk$out_item = __bk$sr;\n`;
        }
        code += '} else { __bk$out_item = ' + itemVar + '; }\n';
        return code;
      };

      if (hasEach) {
        const awaitKw = isAsync ? 'await ' : '';
        if (isAsync) {
          nestedCode = `${outputTarget} = await Promise.all(instance[${JSON.stringify(fieldKey)}].map(async function(__ser_item) {\n`;
        } else {
          nestedCode = `${outputTarget} = instance[${JSON.stringify(fieldKey)}].map(function(__ser_item) {\n`;
        }
        nestedCode += `  var __bk$out_item;\n`;
        nestedCode += buildInstanceofChain('__ser_item', awaitKw);
        nestedCode += `  return __bk$out_item;\n`;
        nestedCode += `});`;
      } else {
        const awaitKw = isAsync ? 'await ' : '';
        const fkStr = JSON.stringify(fieldKey);
        nestedCode = `var __bk$out_item;\n`;
        nestedCode += buildInstanceofChain(`instance[${fkStr}]`, awaitKw);
        nestedCode += `${outputTarget} = __bk$out_item;`;
      }
    } else {
      // Existing simple nested logic
      const nestedCls = meta.type!.resolvedClass ?? meta.type!.fn() as Function;
      const nestedSealed = (nestedCls as any)[SEALED] as SealedExecutors<unknown>;
      const execIdx = execs.length;
      execs.push(nestedSealed);

      if (hasEach) {
        if (isAsync) {
          nestedCode = `${outputTarget} = await Promise.all(instance[${JSON.stringify(fieldKey)}].map(async function(__ser_item) { return __ser_item == null ? __ser_item : await _execs[${execIdx}]._serialize(__ser_item, _opts); }));`;
        } else {
          nestedCode = `${outputTarget} = instance[${JSON.stringify(fieldKey)}].map(function(__ser_item) { return __ser_item == null ? __ser_item : _execs[${execIdx}]._serialize(__ser_item, _opts); });`;
        }
      } else {
        const awaitKw = isAsync ? 'await ' : '';
        nestedCode = `${outputTarget} = ${awaitKw}_execs[${execIdx}]._serialize(instance[${JSON.stringify(fieldKey)}], _opts);`;
      }
    }

    if (useOptionalGuard) {
      innerCode = `if (instance[${JSON.stringify(fieldKey)}] !== undefined && instance[${JSON.stringify(fieldKey)}] !== null) {\n  ${nestedCode}\n} else if (instance[${JSON.stringify(fieldKey)}] === null) {\n  ${outputTarget} = null;\n}\n`;
    } else {
      innerCode = `if (instance[${JSON.stringify(fieldKey)}] != null) {\n  ${nestedCode}\n} else {\n  ${outputTarget} = instance[${JSON.stringify(fieldKey)}];\n}\n`;
    }
  } else {
    // Existing @Transform or direct assign handling
    const outputExpr = buildSerializeOutputExpr(fieldKey, outputKey, meta, refs, isAsync);

    if (useOptionalGuard) {
      innerCode += `if (instance[${JSON.stringify(fieldKey)}] !== undefined) {\n`;
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
 * If @Transform exists, call _refs[i](params); otherwise, direct assignment.
 */
function buildSerializeOutputExpr(
  fieldKey: string,
  outputKey: string,
  meta: RawPropertyMeta,
  refs: unknown[],
  isAsync: boolean,
): string {
  const outputTarget = `__bk$out[${JSON.stringify(outputKey)}]`;

  const serTransforms = meta.transform.filter(
    td => !td.options?.deserializeOnly,
  );

  if (serTransforms.length > 0) {
    let valueExpr = `instance[${JSON.stringify(fieldKey)}]`;
    for (const td of serTransforms) {
      const refIdx = refs.length;
      refs.push(td.fn);
      const callExpr = `_refs[${refIdx}]({value:${valueExpr},key:${JSON.stringify(fieldKey)},obj:instance,type:'serialize'})`;
      const isAsyncTransform = isAsync && isAsyncFunction(td.fn);
      valueExpr = isAsyncTransform ? `(await ${callExpr})` : callExpr;
    }
    return `${outputTarget} = ${valueExpr};`;
  }

  return `${outputTarget} = instance[${JSON.stringify(fieldKey)}];`;
}
