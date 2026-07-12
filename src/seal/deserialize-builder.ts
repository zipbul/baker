import type { Result, ResultAsync } from '@zipbul/result';

import { err as resultErr, isErr as resultIsErr } from '@zipbul/result';

import type { RuntimeOptions, BakerIssue } from '../common';
import type { RawClassMeta, RawPropertyMeta, RuleDef, MessageArgs } from '../metadata';
import type { EmitContext, RulePlanCache } from '../rules';
import type { TypeGateConfig } from './deserialize-codegen';
import type { SealOptions, SealedExecutors, ChildScope, CategorizedRules, ResolvedTypeGate } from './interfaces';
import type { DeserializeExecutor, ValidateExecutor } from './types';

import { CacheKey, BakerError, Direction } from '../common';
import { CollectionType } from '../metadata';
import { emitRulePlan } from '../rules';
import { sanitizeKey, buildGroupsHasExpr, resolveExposeName, resolveExposeGroups } from './codegen-utils';
import { DES_GEN as GEN, PRIMITIVE_TYPE_HINTS, ASSERTER_TO_GATE, GATE_ONLY_ASSERTERS } from './constants';
import {
  toVarName,
  resolveGuardKey,
  GUARD_STRATEGIES,
  wrapGroupsGuard,
  sameGroups,
  generateConversionCode,
  categorizeRules,
  generateNestedResultCode,
  generateNestedEachResultCode,
  generateValidateNestedResult,
  generateValidateNestedEachResultCode,
} from './deserialize-codegen';

// ─────────────────────────────────────────────────────────────────────────────
// DeserializeBuilder — new Function-based executor generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Class-based deserialize/validate code generator. Instance fields are the single source of truth
 * for the per-build state previously threaded through `FieldCodeContext`. Inline-nested DTOs are
 * modelled as CHILD builders (see {@link createChild}) that SHARE the parent's reference arrays
 * (`regexes`/`refs`/`execs`) and `resolve`/`options` while overriding `pathPrefix`/`varPrefix`/
 * `inputExpr`, so executor ref indices stay identical to the free-function implementation.
 */
class DeserializeBuilder {
  readonly Class: Function;
  readonly merged: RawClassMeta;
  readonly options: SealOptions | undefined;
  readonly needsCircularCheck: boolean;
  readonly isAsync: boolean;
  readonly resolve: (cls: Function) => SealedExecutors<unknown> | undefined;

  readonly stopAtFirstError: boolean;
  readonly collectErrors: boolean;
  readonly exposeDefaultValues: boolean;
  readonly validateOnly: boolean;

  // Reference arrays — injected into new Function closure. Shared with child builders.
  readonly regexes: RegExp[];
  readonly refs: unknown[];
  readonly execs: SealedExecutors<unknown>[];

  /**
   * Monotonic id source for inline-nested blocks, shared across child builders (boxed so children
   * mutate the same counter). Each inline block stamps a unique id into its `varPrefix`, making every
   * generated variable name globally unique within the function — so distinct nested scopes can never
   * collide regardless of field-name shapes. Deterministic (fixed traversal order) → byte-identical
   * code across re-seals, preserving compile-cache sharing.
   */
  readonly inlineCounter: { n: number };

  /** Track classes being inlined to detect circular references (shared across child builders). */
  inlineNestedClasses?: Set<Function>;
  /** JS expression for path prefix (inline nested context) */
  readonly pathPrefix?: string;
  /** Prefix for generated variable names (inline nested context) */
  readonly varPrefix?: string;
  /** Input object expression — 'input' by default, custom for inline nested */
  readonly inputExpr?: string;

  constructor(
    Class: Function,
    merged: RawClassMeta,
    options: SealOptions | undefined,
    needsCircularCheck: boolean,
    isAsync: boolean,
    resolve: (cls: Function) => SealedExecutors<unknown> | undefined,
    validateOnly: boolean,
    /** Inline-nested scope inherited from a parent builder; omit for a root builder. */
    scope?: ChildScope,
  ) {
    this.Class = Class;
    this.merged = merged;
    this.options = options;
    this.needsCircularCheck = needsCircularCheck;
    this.isAsync = isAsync;
    this.resolve = resolve;
    this.validateOnly = validateOnly;

    this.stopAtFirstError = options?.stopAtFirstError ?? false;
    this.collectErrors = !this.stopAtFirstError;

    if (scope) {
      // Child: share the parent's reference arrays + circular-tracking set (the single mutable
      // accumulator — keeps executor ref indices identical) and inherit the inline-nested scope.
      // Inline nested never uses exposeDefaultValues.
      this.exposeDefaultValues = false;
      this.regexes = scope.regexes;
      this.refs = scope.refs;
      this.execs = scope.execs;
      this.inlineCounter = scope.inlineCounter;
      if (scope.inlineNestedClasses) {
        this.inlineNestedClasses = scope.inlineNestedClasses;
      }
      this.pathPrefix = scope.pathPrefix;
      this.varPrefix = scope.varPrefix;
      this.inputExpr = scope.inputExpr;
    } else {
      // Root: own a fresh accumulator.
      this.exposeDefaultValues = options?.exposeDefaultValues ?? false;
      this.regexes = [];
      this.refs = [];
      this.execs = [];
      this.inlineCounter = { n: 0 };
    }
  }

  /**
   * Create a CHILD builder for an inline-nested DTO. The child shares the parent's reference arrays
   * and circular-tracking set (the single mutable accumulator) via the constructor `scope` argument,
   * and overrides `pathPrefix`/`varPrefix`/`inputExpr`.
   */
  private createChild(pathPrefix: string, varPrefix: string, inputExpr: string): DeserializeBuilder {
    return new DeserializeBuilder(
      this.Class,
      this.merged,
      this.options,
      this.needsCircularCheck,
      this.isAsync,
      this.resolve,
      this.validateOnly,
      {
        regexes: this.regexes,
        refs: this.refs,
        execs: this.execs,
        inlineCounter: this.inlineCounter,
        inlineNestedClasses: this.inlineNestedClasses,
        pathPrefix,
        varPrefix,
        inputExpr,
      },
    );
  }

  // ── Entry point ────────────────────────────────────────────────────────────

  build<T>(): DeserializeExecutor<T> | ValidateExecutor {
    const { validateOnly, exposeDefaultValues, collectErrors, needsCircularCheck, isAsync, merged, options, Class } = this;
    const { regexes, refs, execs } = this;

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

    // preamble: input type guard
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

    // Whitelist check — reject undeclared fields
    if (options?.whitelist) {
      const allowedKeys = new Set<string>();
      for (const [fieldKey, meta] of Object.entries(merged)) {
        const extractKey = resolveExposeName(fieldKey, meta.expose, Direction.Deserialize);
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

    // Groups variable — only when expose groups or validation rule groups exist.
    // Single for-of with early break avoids Object.values alloc + closure allocations.
    let hasGroupsField = false;
    for (const fk in merged) {
      const meta = merged[fk]!;
      const exposeGroups = resolveExposeGroups(meta.expose, Direction.Deserialize);
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
      body += this.generateFieldCode(fieldKey, meta);
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

    // sourceURL
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

  // ── Field code generation ────────────────────────────────────────────────────

  private generateFieldCode(fieldKey: string, meta: RawPropertyMeta): string {
    const { exposeDefaultValues } = this;

    // ⓪ Exclude deserializeOnly / bidirectional → skip
    if (meta.exclude) {
      if (!meta.exclude.serializeOnly) {
        if (this.options?.debug) {
          const reason = meta.exclude.deserializeOnly ? 'deserializeOnly' : 'bidirectional';
          return `// [baker] field ${JSON.stringify(fieldKey)} excluded (${reason} @Exclude)\n`;
        }
        return '';
      }
    }

    // Expose: check if this field is exposed to deserialize
    // If all @Expose entries are serializeOnly, skip field
    if (meta.expose.length > 0 && meta.expose.every(e => e.serializeOnly)) {
      if (this.options?.debug) {
        return `// [baker] field ${JSON.stringify(fieldKey)} excluded (all @Expose entries are serializeOnly)\n`;
      }
      return '';
    }

    const varName = toVarName(fieldKey, this.varPrefix);
    const extractKey = resolveExposeName(fieldKey, meta.expose, Direction.Deserialize);
    const exposeGroups = resolveExposeGroups(meta.expose, Direction.Deserialize);
    const inputObj = this.inputExpr || 'input';

    // Create EmitContext — bake field-level message/context so EVERY field-own-path failure
    // (gate, required-missing, conversion, structural gates) carries them, not just rule bodies.
    const fieldExtras = this.computeFieldExtras(meta, fieldKey, varName);
    const emitCtx = this.makeEmitCtx(fieldKey, fieldExtras);

    let fieldCode = '';

    // ① @ValidateIf guard
    let validateIfIdx: number | null = null;
    if (meta.flags.validateIf) {
      validateIfIdx = this.refs.length;
      this.refs.push(meta.flags.validateIf);
    }

    // ③ Extract + exposeDefaultValues — W7 (N-4): use Object.hasOwn to block prototype-inherited values
    let extractCode: string;
    const extractKeyJson = JSON.stringify(extractKey);
    if (exposeDefaultValues && !meta.flags.isOptional) {
      // exposeDefaultValues still needs hasOwn — must distinguish "missing key" (use default)
      // from "explicit undefined" (no default). Prototype-only keys are treated as missing.
      const defaultsSource = this.validateOnly ? '__bk$defs' : GEN.out;
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

    // groups check wrap
    let fieldStart = '';
    let fieldEnd = '';
    if (exposeGroups && exposeGroups.length > 0) {
      fieldStart = `if ((${GEN.group0} !== null || ${GEN.groupsSet}) && (${buildGroupsHasExpr(GEN.group0, GEN.groupsSet, exposeGroups)})) {\n`;
      fieldEnd = '}\n';
    }

    // inner content (extract + optional guard + validation + assign)
    let innerCode = extractCode;

    // ② null/undefined guard — optional / nullable combinations
    const useOptionalGuard = meta.flags.isOptional === true;
    const isNullable = meta.flags.isNullable === true;

    const validationCode = this.generateValidationCode(fieldKey, varName, meta, emitCtx, exposeGroups);
    const assignNull = this.validateOnly ? '' : `${GEN.out}[${JSON.stringify(fieldKey)}] = null;\n`;

    const guardKey = resolveGuardKey(isNullable, useOptionalGuard);
    innerCode += GUARD_STRATEGIES[guardKey]({ varName, emitCtx, assignNull, validationCode });

    // ① @ValidateIf outer wrap
    if (validateIfIdx !== null) {
      fieldCode += fieldStart + `if (refs[${validateIfIdx}](${inputObj})) {\n` + innerCode + '}\n' + fieldEnd;
    } else {
      fieldCode += fieldStart + innerCode + fieldEnd;
    }

    return fieldCode;
  }

  // ── Validation code generation — type guard + transform + validate + assign ──

  private generateValidationCode(
    fieldKey: string,
    varName: string,
    meta: RawPropertyMeta,
    emitCtx: EmitContext,
    fieldGroups?: string[],
  ): string {
    const { collectErrors } = this;

    let code = '';

    // @Transform (deserialize direction) — before validation
    const dsTransforms = meta.transform.filter(td => !td.options?.serializeOnly);
    if (dsTransforms.length > 0) {
      const fkJson = JSON.stringify(fieldKey);
      const objExpr = this.inputExpr || 'input';
      if (dsTransforms.length === 1) {
        const td = dsTransforms[0]!;
        const refIdx = this.refs.length;
        this.refs.push(td.fn);
        const callExpr = `refs[${refIdx}]({value:${varName},key:${fkJson},obj:${objExpr}})`;
        code += `${varName} = ${td.isAsync ? 'await ' : ''}${callExpr};\n`;
      } else if (dsTransforms.length === 2) {
        const td0 = dsTransforms[0]!;
        const td1 = dsTransforms[1]!;
        const refIdx0 = this.refs.length;
        this.refs.push(td0.fn);
        const refIdx1 = this.refs.length;
        this.refs.push(td1.fn);
        const call0 = `refs[${refIdx0}]({value:${varName},key:${fkJson},obj:${objExpr}})`;
        const expr0 = td0.isAsync ? `await ${call0}` : call0;
        const call1 = `refs[${refIdx1}]({value:${expr0},key:${fkJson},obj:${objExpr}})`;
        code += `${varName} = ${td1.isAsync ? 'await ' : ''}${call1};\n`;
      } else {
        for (const td of dsTransforms) {
          const refIdx = this.refs.length;
          this.refs.push(td.fn);
          const callExpr = `refs[${refIdx}]({value:${varName},key:${fkJson},obj:${objExpr}})`;
          code += `${varName} = ${td.isAsync ? 'await ' : ''}${callExpr};\n`;
        }
      }
    }

    // Collection (Map/Set) auto conversion
    if (meta.type?.collection) {
      code += this.validateOnly
        ? this.generateCollectionCodeValidateOnly(fieldKey, varName, meta, emitCtx, fieldGroups)
        : this.generateCollectionCode(fieldKey, varName, meta, emitCtx, fieldGroups);
      return code;
    }

    // @ValidateNested + @Type
    if (meta.flags.validateNested && meta.type?.fn) {
      code += this.validateOnly
        ? this.generateNestedCodeValidateOnly(fieldKey, varName, meta, emitCtx)
        : this.generateNestedCode(fieldKey, varName, meta, emitCtx);
      return code;
    }

    // No validation rules → direct assign (skip in validate mode)
    if (meta.validation.length === 0) {
      if (!this.validateOnly) {
        code += `${GEN.out}[${JSON.stringify(fieldKey)}] = ${varName};\n`;
      }
      return code;
    }

    // Build validation with type gate
    code += this.buildRulesCode(fieldKey, varName, meta.validation, collectErrors, emitCtx, meta, fieldGroups);

    return code;
  }

  // ── Helpers for computing message/context extra fields in generated issue objects ──

  /** Build the `,message:...,context:...` extras string for a generated issue object.
   *  `getConstraintsArg` produces the JS expression for a message function's `constraints`
   *  field; it runs AFTER the message ref is pushed, preserving ref-array order. */
  private buildIssueExtras(
    message: string | ((args: MessageArgs) => string) | undefined,
    context: unknown,
    getConstraintsArg: () => string,
    fieldKey: string,
    varName: string,
  ): string {
    let extra = '';
    if (typeof message === 'string') {
      extra += `,message:${JSON.stringify(message)}`;
    } else if (typeof message === 'function') {
      const msgIdx = this.refs.length;
      this.refs.push(message as unknown);
      const constraintsArg = getConstraintsArg();
      extra += `,message:refs[${msgIdx}]({property:${JSON.stringify(fieldKey)},value:${varName},constraints:${constraintsArg}})`;
    }
    if (context !== undefined) {
      const ctxIdx = this.refs.length;
      this.refs.push(context);
      extra += `,context:refs[${ctxIdx}]`;
    }
    return extra;
  }

  /**
   * Split a rule's issue extras into its own message/context part and its (non-empty) constraints
   * part, sharing one `constraints` ref between a message function's argument and the issue field.
   * `each`/element paths use the combined form directly (no field-level fallback for elements); the
   * field path (makeRuleEmitCtx) consumes the two parts to layer the field-level fallback in between.
   */
  private computeRuleExtraParts(
    rd: RuleDef,
    fieldKey: string,
    varName: string,
  ): { ruleMsgCtx: string; constraintsExtra: string } {
    const constraints = rd.rule.constraints;
    const hasConstraints = constraints !== undefined && Object.keys(constraints).length > 0;
    let constraintsIdx = -1;
    const constraintsRef = (): string => {
      if (constraintsIdx === -1) {
        constraintsIdx = this.refs.length;
        this.refs.push(constraints ?? {});
      }
      return `refs[${constraintsIdx}]`;
    };
    const ruleMsgCtx = this.buildIssueExtras(rd.message, rd.context, constraintsRef, fieldKey, varName);
    const constraintsExtra = hasConstraints ? `,constraints:${constraintsRef()}` : '';
    return { ruleMsgCtx, constraintsExtra };
  }

  /** Per-element (`each`) extras — rule's own message/context + non-empty constraints, no field fallback. */
  private computeRuleExtras(rd: RuleDef, fieldKey: string, varName: string): string {
    const { ruleMsgCtx, constraintsExtra } = this.computeRuleExtraParts(rd, fieldKey, varName);
    return ruleMsgCtx + constraintsExtra;
  }

  /** Field-level extras appended to EVERY failure of a field — including non-rule failures
   *  (type gate, required-missing, conversion, structural gates) and type-only fields. No
   *  specific rule applies, so a message function gets `constraints:{}`. */
  private computeFieldExtras(meta: RawPropertyMeta, fieldKey: string, varName: string): string {
    return this.buildIssueExtras(meta.message, meta.context, () => '{}', fieldKey, varName);
  }

  /**
   * Create a per-rule EmitContext. A rule's failure issue resolves message/context as "rule's own,
   * else the field-level fallback" and always carries the rule's own non-empty constraints:
   *   - rule contributes nothing (no own message/context, no constraints) → reuse baseEmitCtx (which
   *     already emits the field-level extras) — unchanged output, no snapshot churn.
   *   - rule contributes → message/context = the rule's own if present, else the field-level
   *     `fieldExtras` baked onto baseEmitCtx; constraints appended from the rule.
   */
  private makeRuleEmitCtx(baseEmitCtx: EmitContext, fieldKey: string, varName: string, rd: RuleDef): EmitContext {
    const { ruleMsgCtx, constraintsExtra } = this.computeRuleExtraParts(rd, fieldKey, varName);
    if (!ruleMsgCtx && !constraintsExtra) {
      return baseEmitCtx;
    }
    const extra = (ruleMsgCtx || (baseEmitCtx.fieldExtras ?? '')) + constraintsExtra;
    const pathExpr = baseEmitCtx.pathExpr ?? JSON.stringify(fieldKey);
    const validateOnly = this.validateOnly;
    return {
      ...baseEmitCtx,
      fail(code: string): string {
        if (baseEmitCtx.collectErrors) {
          return `${GEN.errList}.push({path:${pathExpr},code:${JSON.stringify(code)}${extra}})`;
        } else if (validateOnly) {
          return `return [{path:${pathExpr},code:${JSON.stringify(code)}${extra}}]`;
        }
        return `return err([{path:${pathExpr},code:${JSON.stringify(code)}${extra}}])`;
      },
    };
  }

  private emitRuleList(
    fieldKey: string,
    varName: string,
    rules: RuleDef[],
    emitCtx: EmitContext,
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
    const sk = (this.varPrefix || '') + sanitizeKey(fieldKey);
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
      const ruleEmitCtx = this.makeRuleEmitCtx(emitCtx, fieldKey, varName, rd);
      const gatedCtx = insideTypeGate ? { ...ruleEmitCtx, insideTypeGate: true } : ruleEmitCtx;
      let emitted: string;
      if (sg && rd.rule.plan && (lengthVar || timeVar)) {
        const cache: RulePlanCache = {};
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

  // ── buildRulesCode — type guard + marker pattern ──
  // Decomposed into: categorizeRules → resolveTypeGate → emitTypedRules / emitGeneralRules / emitEachRules

  /** resolveTypeGate — determine effective gate type from asserters/conversion/type hints */
  private resolveTypeGate(fieldKey: string, categorized: CategorizedRules, meta: RawPropertyMeta | undefined): ResolvedTypeGate {
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
    const enableConversion = !!this.options?.enableImplicitConversion && !meta?.transform.some(td => !td.options?.serializeOnly);

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

  /** emitTypedRules — generate type gate + inner validation code */
  private emitTypedRules(
    fieldKey: string,
    varName: string,
    collectErrors: boolean,
    emitCtx: EmitContext,
    config: TypeGateConfig,
    fieldGroups?: string[],
  ): string {
    let code = '';
    const sk = (this.varPrefix || '') + sanitizeKey(fieldKey); // cached — was called up to 4× in this function before

    const {
      effectiveGateType,
      gateCondition,
      gateErrorCode,
      gateEmitCtx,
      otherGeneral,
      gateDeps,
      typeAsserter,
      enableConversion,
    } = config;

    // Helper: emit inner validation rules
    const emitInnerRules = (indent: string): string => {
      const rules: RuleDef[] = [];
      // typeAsserter emit — skip GATE_ONLY_ASSERTERS (isString, isBoolean) as they fully overlap with the gate
      if (typeAsserter && !GATE_ONLY_ASSERTERS.has(typeAsserter.rule.ruleName)) {
        rules.push(typeAsserter);
      }
      rules.push(...otherGeneral, ...gateDeps);
      return this.emitRuleList(fieldKey, varName, rules, emitCtx, indent, fieldGroups, true);
    };

    const canConvert =
      enableConversion &&
      (effectiveGateType === 'string' ||
        effectiveGateType === 'number' ||
        effectiveGateType === 'boolean' ||
        effectiveGateType === 'date');

    if (collectErrors) {
      if (canConvert) {
        // Conversion mode: try convert on gate failure, skip field if conversion fails
        const skipVar = `${GEN.skip}${sk}`;
        code += `var ${skipVar} = false;\n`;
        code += `if (${gateCondition}) {\n`;
        code += generateConversionCode(effectiveGateType, varName, fieldKey, skipVar, true, emitCtx);
        code += `}\n`;
        code += `if (!${skipVar}) {\n`;
        if (this.validateOnly) {
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
        if (this.validateOnly) {
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
      if (canConvert) {
        code += `if (${gateCondition}) {\n`;
        code += generateConversionCode(effectiveGateType, varName, fieldKey, null, false, emitCtx);
        code += `}\n`;
        code += emitInnerRules('');
        if (!this.validateOnly) {
          code += `${GEN.out}[${JSON.stringify(fieldKey)}] = ${varName};\n`;
        }
      } else {
        code += `if (${gateCondition}) ${gateEmitCtx.fail(gateErrorCode)};\n`;
        code += emitInnerRules('');
        if (!this.validateOnly) {
          code += `${GEN.out}[${JSON.stringify(fieldKey)}] = ${varName};\n`;
        }
      }
    }

    return code;
  }

  /** emitGeneralRules — generate type-agnostic rule code */
  private emitGeneralRules(
    fieldKey: string,
    varName: string,
    generalRules: RuleDef[],
    collectErrors: boolean,
    emitCtx: EmitContext,
    fieldGroups?: string[],
  ): string {
    let code = '';
    const sk = (this.varPrefix || '') + sanitizeKey(fieldKey);

    if (collectErrors) {
      if (generalRules.length === 0) {
        if (!this.validateOnly) {
          code += `${GEN.out}[${JSON.stringify(fieldKey)}] = ${varName};\n`;
        }
      } else if (this.validateOnly) {
        code += this.emitRuleList(fieldKey, varName, generalRules, emitCtx, '', fieldGroups);
      } else {
        const markVar = `${GEN.mark}${sk}`;
        code += `var ${markVar} = ${GEN.errList}.length;\n`;
        code += this.emitRuleList(fieldKey, varName, generalRules, emitCtx, '', fieldGroups);
        code += `if (${GEN.errList}.length === ${markVar}) ${GEN.out}[${JSON.stringify(fieldKey)}] = ${varName};\n`;
      }
    } else {
      code += this.emitRuleList(fieldKey, varName, generalRules, emitCtx, '', fieldGroups);
      if (!this.validateOnly) {
        code += `${GEN.out}[${JSON.stringify(fieldKey)}] = ${varName};\n`;
      }
    }

    return code;
  }

  /** emitEachRules — generate Array/Set/Map each code */
  private emitEachRules(
    fieldKey: string,
    varName: string,
    eachRules: RuleDef[],
    collectErrors: boolean,
    emitCtx: EmitContext,
    fieldGroups?: string[],
  ): string {
    let code = '';
    if (eachRules.length === 0) {
      return code;
    }

    // pathKey must honor this.pathPrefix so inlined nested DTOs report full path.
    // Without this, validate(Parent, ...) returned `tags[1]` while deserialize returned `nested.tags[1]`.
    const pathKey = this.pathPrefix ? `${this.pathPrefix}+${JSON.stringify(fieldKey)}` : JSON.stringify(fieldKey);
    const sk = (this.varPrefix || '') + sanitizeKey(fieldKey);
    const iVar = `${GEN.index}${sk}`;
    const siVar = `${GEN.setIdx}${sk}`;
    const svVar = `${GEN.setVal}${sk}`;
    const miVar = `${GEN.mapIdx}${sk}`;
    const mvVar = `${GEN.mapVal}${sk}`;
    const prefixVar = `__bk$ep_${sk}`;
    const kindVar = `__bk$ck${sk}`;
    // Per-iteration element binding — a message function on an `each` rule must receive the failing
    // ELEMENT as `value` (matching the element-level path `field[i]`), not the whole collection.
    const elemVar = `__bk$el${sk}`;

    // Collection kind + non-collection (isArray) rejection are FIELD-level, not per-rule: compute the
    // kind once and reject a non-array/Set/Map a single time. Emitting these inside the per-rule loop
    // pushed a duplicate `isArray` issue for every element rule when a non-collection value was given.
    code += `var ${kindVar} = Array.isArray(${varName})?1:(${varName} instanceof Set?2:(${varName} instanceof Map?3:0));\n`;
    code += `var ${prefixVar} = ${pathKey}+'[';\n`;
    code += `if (${kindVar} === 0) ${emitCtx.fail('isArray')};\n`;

    for (const rd of eachRules) {
      // `value` in a message/context refs the per-iteration element binding (declared in each loop body).
      const extra = this.computeRuleExtras(rd, fieldKey, elemVar);
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
            : this.validateOnly
              ? `return [{path:${prefixVar}+${col.idxVar}+']',code:${JSON.stringify(c)}${extra}}]`
              : `return err([{path:${prefixVar}+${col.idxVar}+']',code:${JSON.stringify(c)}${extra}}])`;
        const colEmitCtx: EmitContext = { ...emitCtx, fail: failFn };
        let block = '';
        block += `  ${col.counterDecl}`;
        block += `  ${col.loopHeader} {\n`;
        block += `    var ${elemVar} = ${col.elemExpr};\n`;
        block += '    ' + rd.rule.emit(elemVar, colEmitCtx) + '\n';
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
  private buildRulesCode(
    fieldKey: string,
    varName: string,
    validation: RawPropertyMeta['validation'],
    collectErrors: boolean,
    emitCtx: EmitContext,
    meta?: RawPropertyMeta,
    fieldGroups?: string[],
  ): string {
    // Phase 1: Categorize rules
    const categorized = categorizeRules(fieldKey, validation);

    // Phase 2: Resolve type gate
    const resolved = this.resolveTypeGate(fieldKey, categorized, meta);

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
        ? this.makeRuleEmitCtx(emitCtx, fieldKey, varName, resolved.typeAsserter)
        : emitCtx;

      code += this.emitTypedRules(
        fieldKey,
        varName,
        collectErrors,
        emitCtx,
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
      code += this.emitGeneralRules(fieldKey, varName, categorized.generalRules, collectErrors, emitCtx, fieldGroups);
    }

    // Phase 4: Emit each rules
    code += this.emitEachRules(fieldKey, varName, categorized.each, collectErrors, emitCtx, fieldGroups);

    return code;
  }

  /**
   * Resolve a nested class's sealed executor. seal() seals every nested DTO (step 4) before deserialize
   * codegen (step 6), so this is always present; throwing on `undefined` turns a would-be runtime
   * "Cannot read 'deserialize'/'merged' of undefined" into a clear seal-time error and removes the cast.
   */
  private resolveExecutor(cls: Function): SealedExecutors<unknown> {
    const sealed = this.resolve(cls);
    if (sealed === undefined) {
      throw new BakerError(`${this.Class.name}: nested class '${cls.name}' was not sealed before deserialize codegen.`);
    }
    return sealed;
  }

  /**
   * Emit element ('each') validation for a DECLARED collection (`@Type(() => Set/Map)`). Shared by the
   * Set/Map × deserialize/validate-only sites so element rules get the same group filtering, per-element
   * `value` binding (for function messages), and path indexing as the canonical `emitEachRules` path.
   * `iterableExpr` must yield the element values (Set → the set, Map → `.values()`, array input → the array).
   */
  private emitDeclaredEachRules(
    fieldKey: string,
    eachRules: RuleDef[],
    iterableExpr: string,
    sk: string,
    emitCtx: EmitContext,
    fieldGroups: string[] | undefined,
    indent: string,
  ): string {
    if (eachRules.length === 0) {
      return '';
    }
    const idxVar = `${GEN.setIdx}${sk}`;
    const elemVar = `__bk$el${sk}`;
    const prefixVar = `__bk$ep_${sk}`;
    const prefixInit = this.pathPrefix ? `${this.pathPrefix}+${JSON.stringify(fieldKey)}+'['` : `${JSON.stringify(fieldKey)}+'['`;
    let code = `${indent}var ${prefixVar} = ${prefixInit};\n`;
    // Rule-first iteration — one element loop PER rule, group guard hoisted outside the loop.
    // Matches the canonical emitEachRules ordering (issues are rule-major) and its guard placement.
    for (const rd of eachRules) {
      // value in a function message refers to the per-iteration ELEMENT, not the whole collection.
      const extra = this.computeRuleExtras(rd, fieldKey, elemVar);
      const rdGroups = rd.groups && rd.groups.length > 0 && !sameGroups(rd.groups, fieldGroups) ? rd.groups : null;
      const guardOpen = rdGroups
        ? `${indent}if ((${GEN.group0} === null && !${GEN.groupsSet}) || ${buildGroupsHasExpr(GEN.group0, GEN.groupsSet, rdGroups)}) {\n`
        : '';
      const guardClose = rdGroups ? `${indent}}\n` : '';
      const failFn = (c: string) =>
        this.collectErrors
          ? `${GEN.errList}.push({path:${prefixVar}+${idxVar}+']',code:${JSON.stringify(c)}${extra}})`
          : this.validateOnly
            ? `return [{path:${prefixVar}+${idxVar}+']',code:${JSON.stringify(c)}${extra}}]`
            : `return err([{path:${prefixVar}+${idxVar}+']',code:${JSON.stringify(c)}${extra}}])`;
      const colEmitCtx: EmitContext = { ...emitCtx, fail: failFn };
      code += guardOpen;
      code += `${indent}  var ${idxVar} = 0;\n`;
      code += `${indent}  for (var ${elemVar} of ${iterableExpr}) {\n`;
      code += `${indent}    ${rd.rule.emit(elemVar, colEmitCtx)}\n`;
      code += `${indent}    ${idxVar}++;\n`;
      code += `${indent}  }\n`;
      code += guardClose;
    }
    return code;
  }

  // ── generateCollectionCode — Map/Set auto conversion ──

  private generateCollectionCode(
    fieldKey: string,
    varName: string,
    meta: RawPropertyMeta,
    emitCtx: EmitContext,
    fieldGroups: string[] | undefined,
  ): string {
    const { collectErrors, execs } = this;
    const sk = (this.varPrefix || '') + sanitizeKey(fieldKey);
    const type = meta.type!;
    const collection = type.collection!;
    const awaitKw = this.isAsync ? 'await ' : '';

    // nested DTO executor (if present)
    let execIdx = -1;
    if (type.resolvedCollectionValue) {
      const nestedSealed = this.resolveExecutor(type.resolvedCollectionValue);
      execIdx = execs.length;
      execs.push(nestedSealed);
    }

    let code = '';

    if (collection === CollectionType.Set) {
      // input: array → Set
      code += `if (Array.isArray(${varName})) {\n`;

      // array-level validation rules (e.g. arrayMinSize)
      const nonEachRules = meta.validation.filter(rd => !rd.each);
      code += this.emitRuleList(fieldKey, varName, nonEachRules, emitCtx, '  ');

      if (execIdx >= 0) {
        // nested DTO Set
        const iVar = `${GEN.index}${sk}`;
        code += `  var ${GEN.arr}${sk} = new Set();\n`;
        code += `  for (var ${iVar}=0; ${iVar}<${varName}.length; ${iVar}++) {\n`;
        code += `    var ${GEN.result}${sk} = ${awaitKw}execs[${execIdx}].deserialize(${varName}[${iVar}], opts);\n`;
        code += generateNestedEachResultCode(
          `${GEN.result}${sk}`,
          `${JSON.stringify(fieldKey)}+'['+${iVar}+'].'`,
          sk,
          collectErrors,
          `${GEN.arr}${sk}.add(${GEN.result}${sk});`,
          '    ',
        );
        code += `  }\n`;
        code += `  ${GEN.out}[${JSON.stringify(fieldKey)}] = ${GEN.arr}${sk};\n`;
      } else {
        // primitive Set
        code += `  ${GEN.out}[${JSON.stringify(fieldKey)}] = new Set(${varName});\n`;
      }

      // each validation rules (per element) — iterate the materialized Set
      const eachRules = meta.validation.filter(rd => rd.each);
      code += this.emitDeclaredEachRules(
        fieldKey,
        eachRules,
        `${GEN.out}[${JSON.stringify(fieldKey)}]`,
        sk,
        emitCtx,
        fieldGroups,
        '  ',
      );

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
        code += generateNestedEachResultCode(
          `${GEN.result}${sk}`,
          `${JSON.stringify(fieldKey)}+'['+${kVar}+'].'`,
          sk,
          collectErrors,
          `${GEN.arr}${sk}.set(${kVar}, ${GEN.result}${sk});`,
          '    ',
        );
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

      // each validation rules (per value) — iterate the materialized Map's values
      const eachRules = meta.validation.filter(rd => rd.each);
      code += this.emitDeclaredEachRules(
        fieldKey,
        eachRules,
        `${GEN.out}[${JSON.stringify(fieldKey)}].values()`,
        sk,
        emitCtx,
        fieldGroups,
        '  ',
      );

      code += `} else { ${emitCtx.fail('isObject')}; }\n`;
    }

    return code;
  }

  // ── generateNestedCode — @ValidateNested + @Type ──

  /**
   * generateDiscriminatorEachCode — deserialize an ARRAY of discriminated DTOs. Mirrors the
   * single-object discriminator path but dispatches the `switch` per element, reporting nested
   * errors at `field[i].` paths and the invalid-discriminator error at the `field[i]` element path.
   */
  private generateDiscriminatorEachCode(
    fieldKey: string,
    varName: string,
    meta: RawPropertyMeta,
    emitCtx: EmitContext,
    sk: string,
  ): string {
    const { collectErrors, execs } = this;
    const disc = meta.type!.discriminator!;
    const keepDisc = meta.type!.keepDiscriminatorProperty === true;
    const discProp = JSON.stringify(disc.property);
    const awaitKwD = this.isAsync ? 'await ' : '';
    const iVar = `${GEN.index}${sk}`;
    const itemVar = `__bk$di${sk}`;
    const discVar = `${GEN.disc}${sk}`;
    const resVar = `${GEN.result}${sk}`;
    const ppBase = this.pathPrefix ? `${this.pathPrefix}+${JSON.stringify(fieldKey)}` : JSON.stringify(fieldKey);
    const elemPathPrefix = `${ppBase}+'['+${iVar}+'].'`;
    const elemPath = `${ppBase}+'['+${iVar}+']'`;
    const validNamesJson = JSON.stringify(disc.subTypes.map(s => s.name));

    let code = `if (Array.isArray(${varName})) {\n`;
    // Array-level (non-each) rules — e.g. arrayMinSize/arrayMaxSize — run once on the array itself.
    const nonEachRules = meta.validation.filter(rd => !rd.each);
    code += this.emitRuleList(fieldKey, varName, nonEachRules, emitCtx, '  ');
    code += `  var ${GEN.arr}${sk} = [];\n`;
    code += `  for (var ${iVar}=0; ${iVar}<${varName}.length; ${iVar}++) {\n`;
    code += `    var ${itemVar} = ${varName}[${iVar}];\n`;
    code += `    var ${discVar} = ${itemVar} && ${itemVar}[${discProp}];\n`;
    code += `    switch (${discVar}) {\n`;
    for (const sub of disc.subTypes) {
      const nestedSealed = this.resolveExecutor(sub.value);
      const execIdx = execs.length;
      execs.push(nestedSealed);
      code += `      case ${JSON.stringify(sub.name)}: {\n`;
      code += `        var ${resVar} = ${awaitKwD}execs[${execIdx}].deserialize(${itemVar}, opts);\n`;
      const successStmt = `${keepDisc ? `${resVar}[${discProp}] = ${discVar}; ` : ''}${GEN.arr}${sk}.push(${resVar});`;
      code += generateNestedEachResultCode(resVar, elemPathPrefix, sk, collectErrors, successStmt, '        ');
      code += `        break;\n`;
      code += `      }\n`;
    }
    const discCtx = `{path:${elemPath},code:'invalidDiscriminator',context:{received:${discVar},validSubTypes:${validNamesJson}}}`;
    code += collectErrors ? `      default: ${GEN.errList}.push(${discCtx});\n` : `      default: return err([${discCtx}]);\n`;
    code += `    }\n`;
    code += `  }\n`;
    code += `  ${GEN.out}[${JSON.stringify(fieldKey)}] = ${GEN.arr}${sk};\n`;
    code += `} else { ${emitCtx.fail('isArray')}; }\n`;
    return code;
  }

  private generateNestedCode(fieldKey: string, varName: string, meta: RawPropertyMeta, emitCtx: EmitContext): string {
    const { collectErrors, execs } = this;

    if (!meta.type) {
      return `${GEN.out}[${JSON.stringify(fieldKey)}] = ${varName};\n`;
    }

    let code = '';
    const sk = (this.varPrefix || '') + sanitizeKey(fieldKey);

    if (meta.type.discriminator) {
      // An array of discriminated DTOs (`type: () => [Base]` + discriminator) dispatches the switch
      // PER ELEMENT — the single-object path below reads the discriminator off the array itself.
      const discHasEach = meta.type.isArray || meta.flags.validateNestedEach || meta.validation.some(rd => rd.each);
      if (discHasEach) {
        return this.generateDiscriminatorEachCode(fieldKey, varName, meta, emitCtx, sk);
      }
      // discriminator
      const discProp = JSON.stringify(meta.type.discriminator.property);
      code += `var ${GEN.disc}${sk} = ${varName} && ${varName}[${discProp}];\n`;
      code += `switch (${GEN.disc}${sk}) {\n`;
      for (const sub of meta.type.discriminator.subTypes) {
        const nestedSealed = this.resolveExecutor(sub.value);
        const execIdx = execs.length;
        execs.push(nestedSealed);
        const awaitKwD = this.isAsync ? 'await ' : '';
        code += `  case ${JSON.stringify(sub.name)}:\n`;
        code += `    var ${GEN.result}${sk} = ${awaitKwD}execs[${execIdx}].deserialize(${varName}, opts);\n`;
        code += generateNestedResultCode(fieldKey, `${GEN.result}${sk}`, collectErrors, this.pathPrefix);
        code += `    break;\n`;
      }
      const validSubTypeNamesJson = JSON.stringify(meta.type.discriminator.subTypes.map(s => s.name));
      const discPathExpr = emitCtx.pathExpr ?? JSON.stringify(fieldKey);
      const discValueExpr = `${GEN.disc}${sk}`;
      if (collectErrors) {
        code += `  default: ${GEN.errList}.push({path:${discPathExpr},code:'invalidDiscriminator',context:{received:${discValueExpr},validSubTypes:${validSubTypeNamesJson}}});\n`;
      } else if (this.validateOnly) {
        code += `  default: return [{path:${discPathExpr},code:'invalidDiscriminator',context:{received:${discValueExpr},validSubTypes:${validSubTypeNamesJson}}}];\n`;
      } else {
        code += `  default: return err([{path:${discPathExpr},code:'invalidDiscriminator',context:{received:${discValueExpr},validSubTypes:${validSubTypeNamesJson}}}]);\n`;
      }
      code += `}\n`;
      // keepDiscriminatorProperty: preserve discriminator property in result object (PB-3).
      // `=== true` matches the serialize side exactly (default drop) — symmetric, not a truthy check.
      if (meta.type.keepDiscriminatorProperty === true) {
        const fkJson = JSON.stringify(fieldKey);
        code += `{var __dh=${GEN.out}[${fkJson}]; if(__dh!=null) __dh[${discProp}]=${GEN.disc}${sk};}\n`;
      }
    } else {
      // simple nested or each array
      const nestedCls = meta.type.resolvedClass ?? (meta.type.fn() as Function);
      const nestedSealed = this.resolveExecutor(nestedCls);
      const execIdx = execs.length;
      execs.push(nestedSealed);

      // Check if validateNested each (array) — meta.type is already proven non-null above
      const hasEach = meta.type.isArray || meta.flags.validateNestedEach || meta.validation.some(rd => rd.each);

      if (hasEach) {
        const iVar = `${GEN.index}${sk}`;
        const awaitKwE = this.isAsync ? 'await ' : '';
        code += `if (Array.isArray(${varName})) {\n`;

        // Emit non-each array-level validation rules (e.g. @ArrayMinSize, @ArrayMaxSize)
        const nonEachRules = meta.validation.filter(rd => !rd.each);
        code += this.emitRuleList(fieldKey, varName, nonEachRules, emitCtx, '  ');

        code += `  var ${GEN.arr}${sk} = [];\n`;
        code += `  for (var ${iVar}=0; ${iVar}<${varName}.length; ${iVar}++) {\n`;
        code += `    var ${GEN.result}${sk} = ${awaitKwE}execs[${execIdx}].deserialize(${varName}[${iVar}], opts);\n`;
        code += generateNestedEachResultCode(
          `${GEN.result}${sk}`,
          `${JSON.stringify(fieldKey)}+'['+${iVar}+'].'`,
          sk,
          collectErrors,
          `${GEN.arr}${sk}.push(${GEN.result}${sk});`,
          '    ',
        );
        code += `  }\n`;
        code += `  ${GEN.out}[${JSON.stringify(fieldKey)}] = ${GEN.arr}${sk};\n`;
        code += `} else { ${emitCtx.fail('isArray')}; }\n`;
      } else {
        const awaitKwS = this.isAsync ? 'await ' : '';
        code += `if (${varName} != null && typeof ${varName} === 'object' && !Array.isArray(${varName})) {\n`;
        code += `  var ${GEN.result}${sk} = ${awaitKwS}execs[${execIdx}].deserialize(${varName}, opts);\n`;
        code += generateNestedResultCode(fieldKey, `${GEN.result}${sk}`, collectErrors, this.pathPrefix);
        code += `} else { ${emitCtx.fail('isObject')}; }\n`;
      }
    }

    return code;
  }

  // ── generateNestedCodeValidateOnly — validate-only nested (inline when possible) ──

  // Inline-eligibility predicate: a nested DTO can be inlined unless it is already in the
  // active inline-set (circular reference). Inlined directly at the three call sites below
  // — no extra function call at seal time.

  /**
   * Emit inline validation code for all fields of a nested DTO via a CHILD builder.
   * The child shares the parent's reference arrays and inline-tracking set but overrides
   * pathPrefix/varPrefix/inputExpr.
   */
  private emitInlineNestedBlock(
    nestedMerged: RawClassMeta,
    nestedClass: Function,
    inputExpr: string,
    pathPrefixExpr: string,
    varPrefix: string,
  ): string {
    const inlinedSet = this.inlineNestedClasses!;
    inlinedSet.add(nestedClass);

    // Stamp a unique id into this block's varPrefix so every generated name in the child scope is
    // globally unique — two nested scopes can never collide even if their field-name shapes would
    // otherwise concatenate to the same prefix.
    const child = this.createChild(pathPrefixExpr, `${varPrefix}${this.inlineCounter.n++}_`, inputExpr);

    let code = '';
    for (const [fieldKey, meta] of Object.entries(nestedMerged)) {
      code += child.generateFieldCode(fieldKey, meta);
    }

    inlinedSet.delete(nestedClass);
    return code;
  }

  /**
   * generateDiscriminatorEachCodeValidateOnly — validate an ARRAY of discriminated DTOs. The validate
   * executor returns `null` on success or an error-array on failure (no Result wrapper), so each
   * element's result is iterated directly. Element errors report `field[i].` / `field[i]` paths.
   */
  private generateDiscriminatorEachCodeValidateOnly(
    fieldKey: string,
    varName: string,
    meta: RawPropertyMeta,
    emitCtx: EmitContext,
    sk: string,
  ): string {
    const { collectErrors, execs } = this;
    const disc = meta.type!.discriminator!;
    const discProp = JSON.stringify(disc.property);
    const awaitKwD = this.isAsync ? 'await ' : '';
    const iVar = `${GEN.index}${sk}`;
    const itemVar = `__bk$di${sk}`;
    const discVar = `${GEN.disc}${sk}`;
    const resVar = `${GEN.result}${sk}`;
    const ppBase = this.pathPrefix ? `${this.pathPrefix}+${JSON.stringify(fieldKey)}` : JSON.stringify(fieldKey);
    const elemPathPrefix = `${ppBase}+'['+${iVar}+'].'`;
    const elemPath = `${ppBase}+'['+${iVar}+']'`;
    const validNamesJson = JSON.stringify(disc.subTypes.map(s => s.name));

    let code = `if (Array.isArray(${varName})) {\n`;
    const nonEachRules = meta.validation.filter(rd => !rd.each);
    code += this.emitRuleList(fieldKey, varName, nonEachRules, emitCtx, '  ');
    code += `  for (var ${iVar}=0; ${iVar}<${varName}.length; ${iVar}++) {\n`;
    code += `    var ${itemVar} = ${varName}[${iVar}];\n`;
    code += `    var ${discVar} = ${itemVar} && ${itemVar}[${discProp}];\n`;
    code += `    switch (${discVar}) {\n`;
    for (const sub of disc.subTypes) {
      const subSealed = this.resolveExecutor(sub.value);
      const execIdx = execs.length;
      execs.push(subSealed);
      code += `      case ${JSON.stringify(sub.name)}: {\n`;
      code += `        var ${resVar} = ${awaitKwD}execs[${execIdx}].validate(${itemVar}, opts);\n`;
      code += generateValidateNestedEachResultCode(resVar, elemPathPrefix, sk, collectErrors, '        ');
      code += `        break;\n`;
      code += `      }\n`;
    }
    const discCtx = `{path:${elemPath},code:'invalidDiscriminator',context:{received:${discVar},validSubTypes:${validNamesJson}}}`;
    code += collectErrors ? `      default: ${GEN.errList}.push(${discCtx});\n` : `      default: return [${discCtx}];\n`;
    code += `    }\n`;
    code += `  }\n`;
    code += `} else { ${emitCtx.fail('isArray')}; }\n`;
    return code;
  }

  private generateNestedCodeValidateOnly(fieldKey: string, varName: string, meta: RawPropertyMeta, emitCtx: EmitContext): string {
    const { collectErrors, execs } = this;
    if (!meta.type) {
      return '';
    }
    const sk = (this.varPrefix || '') + sanitizeKey(fieldKey);
    let code = '';

    // Initialize inline tracking set if not present
    if (!this.inlineNestedClasses) {
      this.inlineNestedClasses = new Set();
    }

    if (meta.type.discriminator) {
      // Array of discriminated DTOs — validate the switch per element (see generateNestedCode).
      const discHasEach = meta.type.isArray || meta.flags.validateNestedEach || meta.validation.some(rd => rd.each);
      if (discHasEach) {
        return this.generateDiscriminatorEachCodeValidateOnly(fieldKey, varName, meta, emitCtx, sk);
      }
      // Discriminator — inline each subType's validation
      const discProp = JSON.stringify(meta.type.discriminator.property);
      code += `var ${GEN.disc}${sk} = ${varName} && ${varName}[${discProp}];\n`;
      code += `switch (${GEN.disc}${sk}) {\n`;
      for (const sub of meta.type.discriminator.subTypes) {
        const subSealed = this.resolveExecutor(sub.value);
        const subMerged = subSealed.merged;
        const canInline = subMerged && !this.inlineNestedClasses.has(sub.value);
        code += `  case ${JSON.stringify(sub.name)}:\n`;
        if (canInline) {
          const ppExpr = this.pathPrefix
            ? `${this.pathPrefix}+${JSON.stringify(fieldKey + '.')}`
            : JSON.stringify(fieldKey + '.');
          const vpPrefix = `${sk}_d${sanitizeKey(sub.name)}_`;
          code += this.emitInlineNestedBlock(subMerged!, sub.value, varName, ppExpr, vpPrefix);
        } else {
          const execIdx = execs.length;
          execs.push(subSealed);
          const awaitKw = this.isAsync ? 'await ' : '';
          code += `    var ${GEN.result}${sk} = ${awaitKw}execs[${execIdx}].validate(${varName}, opts);\n`;
          code += generateValidateNestedResult(fieldKey, `${GEN.result}${sk}`, collectErrors, this.pathPrefix);
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
      const nestedSealed = this.resolveExecutor(nestedCls);
      const nestedMerged = nestedSealed.merged;
      const hasEach = meta.type.isArray || meta.flags.validateNestedEach || meta.validation.some(rd => rd.each);

      // Decide: inline or function call
      const useInline = nestedMerged && !this.inlineNestedClasses.has(nestedCls);

      if (hasEach) {
        const iVar = `${GEN.index}${sk}`;
        code += `if (Array.isArray(${varName})) {\n`;
        const nonEachRules = meta.validation.filter(rd => !rd.each);
        code += this.emitRuleList(fieldKey, varName, nonEachRules, emitCtx, '  ');

        code += `  for (var ${iVar}=0; ${iVar}<${varName}.length; ${iVar}++) {\n`;

        if (useInline) {
          // INLINE: generate validation code directly in the loop body.
          // The per-iteration path prefix is emitted as an EXPRESSION (not a precomputed var) so it is
          // built only at the cold error-push sites — the happy path allocates no path string per
          // element (measured ~4x faster on large valid arrays).
          const itemVar = `__il$${sk}item`;
          const ppExpr = this.pathPrefix
            ? `${this.pathPrefix}+${JSON.stringify(fieldKey)}+'['+${iVar}+'].'`
            : `${JSON.stringify(fieldKey)}+'['+${iVar}+'].'`;
          const vpPrefix = `${sk}i_`;

          code += `    var ${itemVar} = ${varName}[${iVar}];\n`;
          code += `    if (${itemVar} == null || typeof ${itemVar} !== 'object' || Array.isArray(${itemVar})) `;
          if (collectErrors) {
            code += `${GEN.errList}.push({path:${ppExpr},code:'invalidInput'});\n`;
          } else {
            code += `return [{path:${ppExpr},code:'invalidInput'}];\n`;
          }
          code += `    else {\n`;
          code += this.emitInlineNestedBlock(nestedMerged!, nestedCls, itemVar, ppExpr, vpPrefix);
          code += `    }\n`;
        } else {
          // FALLBACK: function call to validate
          const execIdx = execs.length;
          execs.push(nestedSealed);
          const awaitKw = this.isAsync ? 'await ' : '';
          code += `    var ${GEN.result}${sk} = ${awaitKw}execs[${execIdx}].validate(${varName}[${iVar}], opts);\n`;
          const ppInit = this.pathPrefix
            ? `${this.pathPrefix}+${JSON.stringify(fieldKey)}+'['+${iVar}+'].'`
            : `${JSON.stringify(fieldKey)}+'['+${iVar}+'].'`;
          code += generateValidateNestedEachResultCode(`${GEN.result}${sk}`, ppInit, sk, collectErrors, '    ');
        }

        code += `  }\n`;
        code += `} else { ${emitCtx.fail('isArray')}; }\n`;
      } else {
        // Single nested object — arrays are objects by `typeof` but are not valid nested DTOs;
        // reject them here (matching the deserialize path) instead of descending into their fields.
        code += `if (${varName} != null && typeof ${varName} === 'object' && !Array.isArray(${varName})) {\n`;

        if (useInline) {
          const ppExpr = this.pathPrefix
            ? `${this.pathPrefix}+${JSON.stringify(fieldKey + '.')}`
            : JSON.stringify(fieldKey + '.');
          const vpPrefix = `${sk}_`;
          code += this.emitInlineNestedBlock(nestedMerged!, nestedCls, varName, ppExpr, vpPrefix);
        } else {
          const execIdx = execs.length;
          execs.push(nestedSealed);
          const awaitKw = this.isAsync ? 'await ' : '';
          code += `  var ${GEN.result}${sk} = ${awaitKw}execs[${execIdx}].validate(${varName}, opts);\n`;
          code += generateValidateNestedResult(fieldKey, `${GEN.result}${sk}`, collectErrors, this.pathPrefix);
        }

        code += `} else { ${emitCtx.fail('isObject')}; }\n`;
      }
    }
    return code;
  }

  // ── generateCollectionCodeValidateOnly — validate-only collection (no Set/Map creation) ──

  private generateCollectionCodeValidateOnly(
    fieldKey: string,
    varName: string,
    meta: RawPropertyMeta,
    emitCtx: EmitContext,
    fieldGroups: string[] | undefined,
  ): string {
    const { collectErrors, execs } = this;
    const sk = (this.varPrefix || '') + sanitizeKey(fieldKey);
    const type = meta.type!;
    const collection = type.collection!;
    const awaitKw = this.isAsync ? 'await ' : '';

    if (!this.inlineNestedClasses) {
      this.inlineNestedClasses = new Set();
    }

    // Resolve nested DTO for collection values
    let nestedCls: Function | undefined;
    let nestedSealed: SealedExecutors<unknown> | undefined;
    let nestedMerged: RawClassMeta | undefined;
    if (type.resolvedCollectionValue) {
      nestedCls = type.resolvedCollectionValue;
      nestedSealed = this.resolveExecutor(nestedCls);
      nestedMerged = nestedSealed.merged;
    }
    const useInline = nestedCls && nestedMerged && !this.inlineNestedClasses.has(nestedCls);

    let code = '';

    if (collection === CollectionType.Set) {
      code += `if (Array.isArray(${varName})) {\n`;
      const nonEachRules = meta.validation.filter(rd => !rd.each);
      code += this.emitRuleList(fieldKey, varName, nonEachRules, emitCtx, '  ');

      if (nestedSealed) {
        const iVar = `${GEN.index}${sk}`;
        code += `  for (var ${iVar}=0; ${iVar}<${varName}.length; ${iVar}++) {\n`;

        if (useInline) {
          // Per-iteration path prefix is emitted as an EXPRESSION (not a precomputed var) so it is built
          // only at the cold error-push sites — the happy path allocates no path string per element.
          const itemVar = `__il$${sk}ci`;
          const ppExpr = this.pathPrefix
            ? `${this.pathPrefix}+${JSON.stringify(fieldKey)}+'['+${iVar}+'].'`
            : `${JSON.stringify(fieldKey)}+'['+${iVar}+'].'`;
          const vpPrefix = `${sk}c_`;
          code += `    var ${itemVar} = ${varName}[${iVar}];\n`;
          code += `    if (${itemVar} == null || typeof ${itemVar} !== 'object' || Array.isArray(${itemVar})) `;
          if (collectErrors) {
            code += `${GEN.errList}.push({path:${ppExpr},code:'invalidInput'});\n`;
          } else {
            code += `return [{path:${ppExpr},code:'invalidInput'}];\n`;
          }
          code += `    else {\n`;
          code += this.emitInlineNestedBlock(nestedMerged!, nestedCls!, itemVar, ppExpr, vpPrefix);
          code += `    }\n`;
        } else {
          const execIdx = execs.length;
          execs.push(nestedSealed);
          code += `    var ${GEN.result}${sk} = ${awaitKw}execs[${execIdx}].validate(${varName}[${iVar}], opts);\n`;
          const ppInit = this.pathPrefix
            ? `${this.pathPrefix}+${JSON.stringify(fieldKey)}+'['+${iVar}+'].'`
            : `${JSON.stringify(fieldKey)}+'['+${iVar}+'].'`;
          code += generateValidateNestedEachResultCode(`${GEN.result}${sk}`, ppInit, sk, collectErrors, '    ');
        }

        code += `  }\n`;
      }

      // each validation — iterate the input array directly
      const eachRules = meta.validation.filter(rd => rd.each);
      code += this.emitDeclaredEachRules(fieldKey, eachRules, varName, sk, emitCtx, fieldGroups, '  ');

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
          const ppExpr = this.pathPrefix
            ? `${this.pathPrefix}+${JSON.stringify(fieldKey)}+'['+${kVar}+'].'`
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
          code += this.emitInlineNestedBlock(nestedMerged!, nestedCls!, itemVar, ppExpr, vpPrefix);
          code += `    }\n`;
        } else {
          const execIdx = execs.length;
          execs.push(nestedSealed);
          code += `    var ${GEN.result}${sk} = ${awaitKw}execs[${execIdx}].validate(${varName}[${kVar}], opts);\n`;
          const ppInit = this.pathPrefix
            ? `${this.pathPrefix}+${JSON.stringify(fieldKey)}+'['+${kVar}+'].'`
            : `${JSON.stringify(fieldKey)}+'['+${kVar}+'].'`;
          code += generateValidateNestedEachResultCode(`${GEN.result}${sk}`, ppInit, sk, collectErrors, '    ');
        }

        code += `  }\n`;
      }

      // each validation rules (per value) — iterate the input object's values
      const eachRules = meta.validation.filter(rd => rd.each);
      code += this.emitDeclaredEachRules(fieldKey, eachRules, `Object.values(${varName})`, sk, emitCtx, fieldGroups, '  ');

      code += `} else { ${emitCtx.fail('isObject')}; }\n`;
    }

    return code;
  }

  // ── makeEmitCtx — create per-field EmitContext ──

  private makeEmitCtx(fieldKey: string, fieldExtras = ''): EmitContext {
    const { collectErrors, regexes, refs, execs, validateOnly, pathPrefix } = this;
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
      fieldExtras,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Exported entry functions — thin wrappers over DeserializeBuilder (signatures unchanged)
// ─────────────────────────────────────────────────────────────────────────────

function buildDeserializeCode<T>(
  Class: Function,
  merged: RawClassMeta,
  options: SealOptions | undefined,
  needsCircularCheck: boolean,
  isAsync: boolean,
  resolve: (cls: Function) => SealedExecutors<unknown> | undefined,
): DeserializeExecutor<T>;
function buildDeserializeCode(
  Class: Function,
  merged: RawClassMeta,
  options: SealOptions | undefined,
  needsCircularCheck: boolean,
  isAsync: boolean,
  resolve: (cls: Function) => SealedExecutors<unknown> | undefined,
  validateOnly: true,
): ValidateExecutor;
function buildDeserializeCode<T>(
  Class: Function,
  merged: RawClassMeta,
  options: SealOptions | undefined,
  needsCircularCheck: boolean,
  isAsync: boolean,
  resolve: (cls: Function) => SealedExecutors<unknown> | undefined,
  validateOnly = false,
): DeserializeExecutor<T> | ValidateExecutor {
  return new DeserializeBuilder(Class, merged, options, needsCircularCheck, isAsync, resolve, validateOnly).build<T>();
}

function buildValidateCode(
  Class: Function,
  merged: RawClassMeta,
  options: SealOptions | undefined,
  needsCircularCheck: boolean,
  isAsync: boolean,
  resolve: (cls: Function) => SealedExecutors<unknown> | undefined,
): ValidateExecutor {
  return buildDeserializeCode(Class, merged, options, needsCircularCheck, isAsync, resolve, true);
}

export { buildDeserializeCode, buildValidateCode };
