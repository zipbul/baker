import type { RuntimeOptions } from '../common';
import type { SealOptions, SealedExecutors } from './interfaces';
import type { RawClassMeta, RawPropertyMeta, TransformDef } from '../metadata';

import { CollectionType } from '../metadata';
import { BakerError, Direction } from '../common';
import { sanitizeKey, buildGroupsHasExpr, resolveExposeName, resolveExposeGroups } from './codegen-utils';
import { SER_GEN as GEN } from './constants';

// Field rename + expose-group resolution (both directions) live in codegen-utils as the single
// source of truth — see resolveExposeName / resolveExposeGroups.

/** Length of a constructor's prototype chain — used to order discriminator subtypes most-derived first. */
function prototypeDepth(ctor: Function): number {
  let depth = 0;
  let proto: unknown = Object.getPrototypeOf(ctor);
  while (typeof proto === 'function') {
    depth += 1;
    proto = Object.getPrototypeOf(proto);
  }
  return depth;
}

// ─────────────────────────────────────────────────────────────────────────────
// SerializeBuilder — new Function-based serialize executor generation (serialize pipeline)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds a serialize executor for a single sealed class.
 *
 * State threaded through codegen (refs/execs/options/isAsync/resolve/…) lives as
 * instance fields; the per-field/per-expression generators are methods that read
 * from `this`, so data flows from a single source of truth rather than being
 * passed around.
 *
 * Assumes no validation — the generated executor always returns
 * Record<string, unknown>.
 */
class SerializeBuilder<T> {
  /** Runtime references injected into the generated function (transform fns, classes). */
  private readonly refs: unknown[] = [];
  /** Nested sealed executors injected into the generated function. */
  private readonly execs: SealedExecutors<unknown>[] = [];

  private readonly Class: Function;
  private readonly merged: RawClassMeta;
  private readonly options: SealOptions | undefined;
  private readonly isAsync: boolean;
  private readonly resolve: (cls: Function) => SealedExecutors<unknown> | undefined;

  constructor(
    Class: Function,
    merged: RawClassMeta,
    options: SealOptions | undefined,
    isAsync: boolean,
    resolve: (cls: Function) => SealedExecutors<unknown> | undefined,
  ) {
    this.Class = Class;
    this.merged = merged;
    this.options = options;
    this.isAsync = isAsync;
    this.resolve = resolve;
  }

  /** Generate and instantiate the serialize executor. */
  build(): (instance: T, opts?: RuntimeOptions) => Record<string, unknown> | Promise<Record<string, unknown>> {
    // ── Code generation ────────────────────────────────────────────────────────

    let body = "'use strict';\n";
    body += `var ${GEN.out} = {};\n`;

    // Groups variable — only when fields referencing groups exist. for-in + early break (matches the
    // deserialize builder): no Object.values array or per-element closure allocation at seal time.
    let hasGroupsField = false;
    for (const fk in this.merged) {
      const meta = this.merged[fk];
      if (meta === undefined) {
        continue;
      }
      const groups = resolveExposeGroups(meta.expose, Direction.Serialize);
      if (groups && groups.length > 0) {
        hasGroupsField = true;
        break;
      }
    }
    if (hasGroupsField) {
      body += `var ${GEN.groups} = opts && opts.groups;\n`;
      body += `var ${GEN.group0} = ${GEN.groups} && ${GEN.groups}.length === 1 ? ${GEN.groups}[0] : null;\n`;
      body += `var ${GEN.groupsSet} = ${GEN.groups} && ${GEN.groups}.length > 1 ? new Set(${GEN.groups}) : null;\n`;
    }

    for (const [fieldKey, meta] of Object.entries(this.merged)) {
      body += this.generateFieldCode(fieldKey, meta);
    }

    body += `return ${GEN.out};\n`;

    // sourceURL
    // Sanitize class name so it cannot inject newlines / */ that would break out of the comment.
    const safeClsName = this.Class.name.replace(/[^\w$.-]/g, '_');
    body += `//# sourceURL=baker://${safeClsName}/serialize\n`;

    // ── Execute new Function ───────────────────────────────────────────────────

    const fnKeyword = this.isAsync ? 'async function' : 'function';
    const executor = new Function('refs', 'execs', 'BakerError', `return ${fnKeyword}(instance, opts) { ` + body + ' }')(
      this.refs,
      this.execs,
      BakerError,
    ) as (instance: T, opts?: RuntimeOptions) => Record<string, unknown> | Promise<Record<string, unknown>>;

    return executor;
  }

  /**
   * Resolve a nested class's sealed executor. seal() seals every nested DTO (step 4) before serialize
   * codegen (step 7), so this is always present; throwing on `undefined` turns a would-be runtime
   * "Cannot read 'serialize' of undefined" into a clear seal-time error and removes the cast at call sites.
   */
  private resolveExecutor(cls: Function): SealedExecutors<unknown> {
    const sealed = this.resolve(cls);
    if (sealed === undefined) {
      throw new BakerError(`${this.Class.name}: nested class '${cls.name}' was not sealed before serialize codegen.`);
    }
    return sealed;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Per-field serialize code generation
  // ───────────────────────────────────────────────────────────────────────────

  private generateFieldCode(fieldKey: string, meta: RawPropertyMeta): string {
    const className = this.Class.name;
    const options = this.options;

    // ⓪ Exclude serializeOnly / bidirectional → skip
    if (meta.exclude) {
      if (!meta.exclude.deserializeOnly) {
        if (options?.debug) {
          const reason = meta.exclude.serializeOnly ? 'serializeOnly' : 'bidirectional';
          return `// [baker] field ${JSON.stringify(fieldKey)} excluded (${reason} @Exclude)\n`;
        }
        return '';
      }
    }

    // Expose: if all @Expose entries are deserializeOnly, skip for serialize
    if (meta.expose.length > 0 && meta.expose.every(e => e.deserializeOnly)) {
      if (options?.debug) {
        return `// [baker] field ${JSON.stringify(fieldKey)} excluded (all @Expose entries are deserializeOnly)\n`;
      }
      return '';
    }

    const outputKey = resolveExposeName(fieldKey, meta.expose, Direction.Serialize);
    const exposeGroups = resolveExposeGroups(meta.expose, Direction.Serialize);
    const sk = sanitizeKey(fieldKey);
    const fieldVal = `${GEN.fieldVal}${sk}`;

    let fieldCode = '';
    fieldCode += `var ${fieldVal} = instance[${JSON.stringify(fieldKey)}];\n`;

    // groups check wrap
    let fieldStart = '';
    let fieldEnd = '';
    if (exposeGroups && exposeGroups.length > 0) {
      fieldStart = `if ((${GEN.group0} !== null || ${GEN.groupsSet}) && (${buildGroupsHasExpr(GEN.group0, GEN.groupsSet, exposeGroups)})) {\n`;
      fieldEnd = '}\n';
    }

    let innerCode = '';

    // ② @IsOptional → skip output if undefined (serialize step 2)
    const useOptionalGuard = meta.flags.isOptional;

    // Collect serialize-direction transforms once
    const serTransforms = meta.transform.filter(td => !td.options?.deserializeOnly);

    // ③a Collection (Map/Set) serialize — Set → Array, Map → plain object
    if (meta.type?.collection) {
      const outputTarget = `${GEN.out}[${JSON.stringify(outputKey)}]`;
      const collection = meta.type.collection;
      let nestedCode: string;

      if (collection === CollectionType.Set) {
        if (meta.type.resolvedCollectionValue) {
          const nestedSealed = this.resolveExecutor(meta.type.resolvedCollectionValue);
          const execIdx = this.execs.length;
          this.execs.push(nestedSealed);
          if (this.isAsync) {
            nestedCode = `{ var __ser_ps${sk} = []; for (var __ser_item${sk} of ${fieldVal}) { __ser_ps${sk}.push(__ser_item${sk} == null ? __ser_item${sk} : execs[${execIdx}].serialize(__ser_item${sk}, opts)); } ${outputTarget} = await Promise.all(__ser_ps${sk}); }`;
          } else {
            nestedCode = `var ${GEN.setArr}${sk} = [];\n`;
            nestedCode += `  for (var ${GEN.setItem}${sk} of ${fieldVal}) {\n`;
            nestedCode += `    ${GEN.setArr}${sk}.push(${GEN.setItem}${sk} == null ? ${GEN.setItem}${sk} : execs[${execIdx}].serialize(${GEN.setItem}${sk}, opts));\n`;
            nestedCode += `  }\n`;
            nestedCode += `  ${outputTarget} = ${GEN.setArr}${sk};`;
          }
        } else {
          nestedCode = `${outputTarget} = [...${fieldVal}];`;
        }
      } else {
        // Map → plain object (W8: keys must be strings — throw otherwise)
        const keyCheck = `if (typeof ${GEN.mapEntry}${sk}[0] !== 'string') { throw new BakerError(${JSON.stringify(className)} + ': Map field ' + ${JSON.stringify(fieldKey)} + ' has non-string key (' + typeof ${GEN.mapEntry}${sk}[0] + '). Map serialization requires string keys.'); }\n    `;
        if (meta.type.resolvedCollectionValue) {
          const nestedSealed = this.resolveExecutor(meta.type.resolvedCollectionValue);
          const execIdx = this.execs.length;
          this.execs.push(nestedSealed);
          const awaitKw = this.isAsync ? 'await ' : '';
          nestedCode = `var ${GEN.mapObj}${sk} = Object.create(null);\n`;
          nestedCode += `  for (var ${GEN.mapEntry}${sk} of ${fieldVal}) {\n`;
          nestedCode += `    ${keyCheck}`;
          nestedCode += `${GEN.mapObj}${sk}[${GEN.mapEntry}${sk}[0]] = ${GEN.mapEntry}${sk}[1] == null ? ${GEN.mapEntry}${sk}[1] : ${awaitKw}execs[${execIdx}].serialize(${GEN.mapEntry}${sk}[1], opts);\n`;
          nestedCode += `  }\n`;
          nestedCode += `  ${outputTarget} = ${GEN.mapObj}${sk};`;
        } else {
          nestedCode = `var ${GEN.mapObj}${sk} = Object.create(null);\n`;
          nestedCode += `  for (var ${GEN.mapEntry}${sk} of ${fieldVal}) {\n`;
          nestedCode += `    ${keyCheck}`;
          nestedCode += `${GEN.mapObj}${sk}[${GEN.mapEntry}${sk}[0]] = ${GEN.mapEntry}${sk}[1];\n`;
          nestedCode += `  }\n`;
          nestedCode += `  ${outputTarget} = ${GEN.mapObj}${sk};`;
        }
      }

      // Apply serialize transforms after collection serialize (nested → transform)
      nestedCode += this.buildPostNestedTransformCode(outputTarget, fieldKey, serTransforms);

      if (useOptionalGuard) {
        innerCode = `if (${fieldVal} !== undefined && ${fieldVal} !== null) {\n  ${nestedCode}\n} else if (${fieldVal} === null) {\n  ${outputTarget} = null;\n}\n`;
      } else {
        innerCode = `if (${fieldVal} != null) {\n  ${nestedCode}\n} else {\n  ${outputTarget} = ${fieldVal};\n}\n`;
      }

      fieldCode += fieldStart + innerCode + fieldEnd;
      return fieldCode;
    }

    // ③b nested @Type handling (H4) — supports type + transform combination (nested serialize → transform)
    const type = meta.type;
    if (type && (type.resolvedClass || type.discriminator || (type.fn && meta.flags.validateNested))) {
      // Determine array/each mode
      const hasEach = type.isArray || meta.flags.validateNestedEach || meta.validation.some(rd => rd.each);
      const outputTarget = `${GEN.out}[${JSON.stringify(outputKey)}]`;

      let nestedCode: string;

      if (type.discriminator) {
        // discriminator serialize — instanceof dispatch
        const { property, subTypes } = type.discriminator;
        const keepDisc = type.keepDiscriminatorProperty === true; // default drop — symmetric with deserialize (deserialize-builder PB-3)

        // Sort most-specific-first via a TOTAL order: deeper prototype chain (more derived) first,
        // ties broken by declaration index. A pairwise instanceof comparator is only a partial order
        // (unrelated subtypes compare equal), which is non-transitive and engine-dependent.
        const sorted = subTypes
          .map((sub, index) => ({ sub, index, depth: prototypeDepth(sub.value) }))
          .sort((a, b) => b.depth - a.depth || a.index - b.index)
          .map(entry => entry.sub);

        // Helper for generating instanceof branch code
        const buildInstanceofChain = (itemVar: string, awaitKw: string): string => {
          let code = '';
          for (let i = 0; i < sorted.length; i++) {
            const sub = sorted[i]!;
            const nestedSealed = this.resolveExecutor(sub.value);
            const execIdx = this.execs.length;
            this.execs.push(nestedSealed);
            const refIdx = this.refs.length;
            this.refs.push(sub.value);
            const prefix = i === 0 ? 'if' : '} else if';
            code += `${prefix} (${itemVar} instanceof refs[${refIdx}]) {\n`;
            code += `  var ${GEN.serResult}${sk} = ${awaitKw}execs[${execIdx}].serialize(${itemVar}, opts);\n`;
            if (keepDisc) {
              code += `  ${GEN.serResult}${sk}[${JSON.stringify(property)}] = ${JSON.stringify(sub.name)};\n`;
            }
            code += `  ${GEN.outItem}${sk} = ${GEN.serResult}${sk};\n`;
          }
          // No subtype matched — throw instead of leaking the raw (un-serialized) instance into the
          // output, symmetric with the deserialize side rejecting an unknown discriminator value.
          const validNamesJson = JSON.stringify(JSON.stringify(subTypes.map(s => s.name)));
          const recvExpr = `(${itemVar} == null ? ${itemVar} : ${itemVar}[${JSON.stringify(property)}])`;
          const msgPrefix = JSON.stringify(`${className}.${fieldKey}: value matches no discriminator subtype (received discriminator=`);
          code +=
            `} else { throw new BakerError(${msgPrefix} + JSON.stringify(${recvExpr}) + ` +
            `${JSON.stringify(', expected one of ')} + ${validNamesJson} + ${JSON.stringify(')')}); }\n`;
          return code;
        };

        if (hasEach) {
          const awaitKw = this.isAsync ? 'await ' : '';
          const discItem = `__ser_item${sk}`;
          if (this.isAsync) {
            nestedCode = `${outputTarget} = await Promise.all(${fieldVal}.map(async function(${discItem}) {\n`;
          } else {
            nestedCode = `var ${GEN.discArr}${sk} = [];\n`;
            nestedCode += `  for (var ${GEN.discIdx}${sk}=0; ${GEN.discIdx}${sk}<${fieldVal}.length; ${GEN.discIdx}${sk}++) {\n`;
            nestedCode += `    var ${discItem} = ${fieldVal}[${GEN.discIdx}${sk}];\n`;
          }
          nestedCode += `    var ${GEN.outItem}${sk};\n`;
          nestedCode += buildInstanceofChain(discItem, awaitKw);
          if (this.isAsync) {
            nestedCode += `  return ${GEN.outItem}${sk};\n`;
            nestedCode += `}));`;
          } else {
            nestedCode += `    ${GEN.discArr}${sk}.push(${GEN.outItem}${sk});\n`;
            nestedCode += `  }\n`;
            nestedCode += `  ${outputTarget} = ${GEN.discArr}${sk};`;
          }
        } else {
          const awaitKw = this.isAsync ? 'await ' : '';
          nestedCode = `var ${GEN.outItem}${sk};\n`;
          nestedCode += buildInstanceofChain(fieldVal, awaitKw);
          nestedCode += `${outputTarget} = ${GEN.outItem}${sk};`;
        }
      } else {
        // Existing simple nested logic
        const nestedCls = type.resolvedClass ?? (type.fn() as Function);
        const nestedSealed = this.resolveExecutor(nestedCls);
        const execIdx = this.execs.length;
        this.execs.push(nestedSealed);

        if (hasEach) {
          if (this.isAsync) {
            nestedCode = `${outputTarget} = await Promise.all(${fieldVal}.map(async function(__ser_item) { return __ser_item == null ? __ser_item : await execs[${execIdx}].serialize(__ser_item, opts); }));`;
          } else {
            nestedCode = `var ${GEN.nestedArr}${sk} = [];\n`;
            nestedCode += `  for (var ${GEN.nestedIdx}${sk}=0; ${GEN.nestedIdx}${sk}<${fieldVal}.length; ${GEN.nestedIdx}${sk}++) {\n`;
            nestedCode += `    var ${GEN.nestedItem}${sk} = ${fieldVal}[${GEN.nestedIdx}${sk}];\n`;
            nestedCode += `    ${GEN.nestedArr}${sk}.push(${GEN.nestedItem}${sk} == null ? ${GEN.nestedItem}${sk} : execs[${execIdx}].serialize(${GEN.nestedItem}${sk}, opts));\n`;
            nestedCode += `  }\n`;
            nestedCode += `  ${outputTarget} = ${GEN.nestedArr}${sk};`;
          }
        } else {
          const awaitKw = this.isAsync ? 'await ' : '';
          nestedCode = `${outputTarget} = ${awaitKw}execs[${execIdx}].serialize(${fieldVal}, opts);`;
        }
      }

      // Apply serialize transforms after nested serialize (nested serialize → transform)
      nestedCode += this.buildPostNestedTransformCode(outputTarget, fieldKey, serTransforms);

      if (useOptionalGuard) {
        innerCode = `if (${fieldVal} !== undefined && ${fieldVal} !== null) {\n  ${nestedCode}\n} else if (${fieldVal} === null) {\n  ${outputTarget} = null;\n}\n`;
      } else {
        innerCode = `if (${fieldVal} != null) {\n  ${nestedCode}\n} else {\n  ${outputTarget} = ${fieldVal};\n}\n`;
      }
    } else {
      // Existing @Transform or direct assign handling
      const outputExpr = this.buildOutputExpr(fieldKey, outputKey, fieldVal, meta);

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
   * Build serialize-direction transform expression.
   * Serialize direction reverses declaration order (codec stack unwrapping).
   */
  private buildTransformExpr(inputExpr: string, fieldKey: string, serTransforms: TransformDef[]): string | null {
    if (serTransforms.length === 0) {
      return null;
    }
    const refs = this.refs;
    // Walk serTransforms backwards in place (serialize reverses declaration order) — no clone allocation.
    // The general loop already emits byte-identical code for 1 and 2 transforms, so no length fast-paths.
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
  private buildPostNestedTransformCode(outputTarget: string, fieldKey: string, serTransforms: TransformDef[]): string {
    const transformed = this.buildTransformExpr(outputTarget, fieldKey, serTransforms);
    return transformed ? `\n${outputTarget} = ${transformed};` : '';
  }

  /**
   * Build field output expression.
   * If @Transform exists, call refs[i](params); otherwise, direct assignment.
   */
  private buildOutputExpr(fieldKey: string, outputKey: string, fieldValueExpr: string, meta: RawPropertyMeta): string {
    const outputTarget = `${GEN.out}[${JSON.stringify(outputKey)}]`;

    const serTransforms = meta.transform.filter(td => !td.options?.deserializeOnly);

    if (serTransforms.length > 0) {
      const transformed = this.buildTransformExpr(fieldValueExpr, fieldKey, serTransforms)!;
      return `${outputTarget} = ${transformed};`;
    }

    return `${outputTarget} = ${fieldValueExpr};`;
  }
}

/**
 * Generate serialize executor code.
 * Thin wrapper preserving the historical free-function entry point: instantiates
 * SerializeBuilder and returns its built executor.
 */
function buildSerializeCode<T>(
  Class: Function,
  merged: RawClassMeta,
  options: SealOptions | undefined,
  isAsync: boolean,
  resolve: (cls: Function) => SealedExecutors<unknown> | undefined,
): (instance: T, opts?: RuntimeOptions) => Record<string, unknown> | Promise<Record<string, unknown>> {
  return new SerializeBuilder<T>(Class, merged, options, isAsync, resolve).build();
}

export { buildSerializeCode };
