import { SEALED } from '../symbols';
import { isAsyncFunction } from '../utils';
import type { RawClassMeta, RawPropertyMeta, SealedExecutors } from '../types';
import type { SealOptions, RuntimeOptions } from '../interfaces';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** serialize 방향의 출력 키 결정 */
function getSerializeOutputKey(fieldKey: string, exposeStack: RawPropertyMeta['expose']): string {
  // serializeOnly @Expose with name → 해당 name 사용
  const serDef = exposeStack.find(e => e.serializeOnly && e.name);
  if (serDef) return serDef.name!;
  // 방향 미지정 @Expose with name → 양방향 사용
  const biDef = exposeStack.find(e => !e.deserializeOnly && !e.serializeOnly && e.name);
  if (biDef) return biDef.name!;
  return fieldKey;
}

/** serialize 방향의 expose groups 결정 — 무조건 노출 엔트리가 하나라도 있으면 undefined (제한 없음) */
function getSerializeExposeGroups(exposeStack: RawPropertyMeta['expose']): string[] | undefined {
  const serEntries = exposeStack.filter(e => !e.deserializeOnly);
  if (serEntries.length === 0) return undefined;
  if (serEntries.some(e => !e.groups || e.groups.length === 0)) return undefined;
  const all = new Set<string>();
  for (const e of serEntries) for (const g of e.groups!) all.add(g);
  return [...all];
}

// ─────────────────────────────────────────────────────────────────────────────
// buildSerializeCode — new Function 기반 serialize executor 생성 (§4.3 serialize 파이프라인)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * serialize executor 코드 생성.
 * 무검증 전제 — 항상 Record<string, unknown> 반환 (§4.3).
 */
export function buildSerializeCode<T>(
  Class: Function,
  merged: RawClassMeta,
  options: SealOptions | undefined,
  isAsync: boolean,
): (instance: T, opts?: RuntimeOptions) => Record<string, unknown> | Promise<Record<string, unknown>> {
  const refs: unknown[] = [];
  const execs: SealedExecutors<unknown>[] = [];

  // ── 코드 생성 ─────────────────────────────────────────────────────────────

  let body = '\'use strict\';\n';
  body += 'var __bk$out = {};\n';

  // groups 변수 — groups를 참조하는 필드가 있을 때만
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

  // ── new Function 실행 ─────────────────────────────────────────────────────

  const fnKeyword = isAsync ? 'async function' : 'function';
  const executor = new Function(
    '_refs', '_execs',
    `return ${fnKeyword}(instance, _opts) { ` + body + ' }',
  )(refs, execs) as (instance: T, opts?: RuntimeOptions) => Record<string, unknown> | Promise<Record<string, unknown>>;

  return executor;
}

// ─────────────────────────────────────────────────────────────────────────────
// 필드별 serialize 코드 생성
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

  // ② @IsOptional → undefined 면 출력 생략 (§4.3 serialize ②)
  const useOptionalGuard = meta.flags.isOptional;

  // ③ nested @Type 처리 (H4) — @Transform 없는 경우에만 (§4.3 serialize 파이프라인)
  if ((meta.type?.resolvedClass || meta.type?.discriminator || (meta.type?.fn && meta.flags.validateNested)) && !meta.transform.filter(td => !td.options?.deserializeOnly).length) {

    // 배열/each 여부 판단
    const hasEach = meta.type?.isArray || meta.flags.validateNestedEach || meta.validation.some(rd => rd.each);
    const outputTarget = `__bk$out[${JSON.stringify(outputKey)}]`;

    let nestedCode: string;

    if (meta.type!.discriminator) {
      // §C-8 discriminator serialize — instanceof dispatch
      const { property, subTypes } = meta.type!.discriminator;
      const keepDisc = meta.type!.keepDiscriminatorProperty !== false; // default true for round-trip

      // most-specific-first 정렬 (상속 관계 시 하위 클래스 우선)
      const sorted = [...subTypes].sort((a, b) => {
        if ((a.value as any).prototype instanceof b.value) return -1;
        if ((b.value as any).prototype instanceof a.value) return 1;
        return 0;
      });

      // instanceof 분기 코드 생성 헬퍼
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
      // 기존 단순 nested 로직
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
    // 기존 @Transform or direct assign 처리
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
 * 필드 출력 표현식 빌드.
 * @Transform 있으면 _refs[i](params) 호출, 없으면 직접 할당.
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
