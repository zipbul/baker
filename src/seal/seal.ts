import { RAW, SEALED } from '../symbols';
import { globalRegistry } from '../registry';
import { SealError } from '../errors';
import { _getGlobalOptions } from '../configure';
import { buildDeserializeCode } from './deserialize-builder';
import { buildSerializeCode } from './serialize-builder';
import { analyzeCircular } from './circular-analyzer';
import { validateExposeStacks } from './expose-validator';
import type { RawClassMeta, SealedExecutors } from '../types';
import type { SealOptions } from '../interfaces';

// ─────────────────────────────────────────────────────────────────────────────
// analyzeAsync — sealed DTO가 async executor를 필요로 하는지 정적 분석 (C1)
// ─────────────────────────────────────────────────────────────────────────────

function analyzeAsync(merged: RawClassMeta, direction: 'deserialize' | 'serialize', visited?: Set<Function>): boolean {
  for (const meta of Object.values(merged)) {
    // 1. createRule async (deserialize 방향만)
    if (direction === 'deserialize' && meta.validation.some(rd => rd.rule.isAsync)) return true;
    // 2. @Transform async
    const transforms = direction === 'deserialize'
      ? meta.transform.filter(td => !td.options?.serializeOnly)
      : meta.transform.filter(td => !td.options?.deserializeOnly);
    if (transforms.some(td => (td.fn as any).constructor?.name === 'AsyncFunction')) return true;
    // 3. nested DTO async — resolvedClass 사용 (정규화 이후), 미정규화 시 fn() fallback
    if (meta.type?.resolvedClass || meta.type?.fn) {
      const nestedClass = meta.type.resolvedClass ?? meta.type.fn() as Function;
      const v = visited ?? new Set<Function>();
      if (!v.has(nestedClass)) {
        v.add(nestedClass);
        const nestedMerged = mergeInheritance(nestedClass);
        if (analyzeAsync(nestedMerged, direction, v)) return true;
      }
    }
    // discriminator subTypes
    if (meta.type?.discriminator) {
      for (const sub of meta.type.discriminator.subTypes) {
        const v = visited ?? new Set<Function>();
        if (!v.has(sub.value)) {
          v.add(sub.value);
          const subMerged = mergeInheritance(sub.value);
          if (analyzeAsync(subMerged, direction, v)) return true;
        }
      }
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// 봉인 상태 플래그
// ─────────────────────────────────────────────────────────────────────────────

let _sealed = false;

/** @internal — configure()에서 사후 호출 경고용 */
export function _isSealed(): boolean { return _sealed; }

/** seal 완료된 클래스 목록 — unseal에서 SEALED 제거 시 사용 */
export const _sealedClasses = new Set<Function>();

// ─────────────────────────────────────────────────────────────────────────────
// _autoSeal — 첫 deserialize/serialize 호출 시 globalRegistry 전체 배치 seal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @internal — deserialize/serialize에서 호출.
 * 이미 sealed면 no-op.
 */
export function _autoSeal(): void {
  if (_sealed) return;

  const options = _getGlobalOptions();

  try {
    for (const Class of globalRegistry) {
      sealOne(Class, options);
    }
  } catch (e) {
    // 실패 시 stale placeholder 정리 — 부분 seal 상태 방지
    for (const Class of globalRegistry) {
      if (Object.prototype.hasOwnProperty.call(Class, SEALED)) {
        delete (Class as any)[SEALED];
      }
    }
    throw e;
  }

  for (const Class of globalRegistry) {
    _sealedClasses.add(Class);
    delete (Class as any)[RAW];
  }
  globalRegistry.clear();

  _sealed = true;
}

/**
 * @internal — 동적 import로 auto-seal 이후에 등록된 클래스를 즉석 seal.
 * Class[RAW]가 있고 Class[SEALED]가 없는 경우에만 동작.
 */
export function _sealOnDemand(Class: Function): void {
  if (Object.prototype.hasOwnProperty.call(Class, SEALED)) return;
  if (!Object.prototype.hasOwnProperty.call(Class, RAW)) return;

  const before = new Set(_sealedClasses);
  const options = _getGlobalOptions();
  sealOne(Class, options);

  // sealOne이 재귀적으로 seal한 nested DTO도 정리
  _sealedClasses.add(Class);
  delete (Class as any)[RAW];
  globalRegistry.delete(Class);

  // 재귀로 seal된 추가 클래스 정리 (RAW 삭제 + registry 제거)
  for (const C of globalRegistry) {
    if (Object.prototype.hasOwnProperty.call(C, SEALED) && !before.has(C)) {
      _sealedClasses.add(C);
      delete (C as any)[RAW];
      globalRegistry.delete(C);
    }
  }
}

/**
 * @internal 테스트 전용 — testing.ts의 unseal()에서 호출
 */
export function _resetForTesting(): void {
  _sealed = false;
  _sealedClasses.clear();
}

// ─────────────────────────────────────────────────────────────────────────────
// sealOne() — 개별 클래스 봉인 (§4.1)
// ─────────────────────────────────────────────────────────────────────────────

/** placeholder 전용 — 봉인 진행 중 호출 시 에러 */
function _sealInProgressThrow(): never {
  throw new SealError('seal in progress');
}

function sealOne<T>(Class: Function, options?: SealOptions): void {
  if (Object.prototype.hasOwnProperty.call(Class, SEALED)) return; // 이미 봉인됨 (순환 참조 중 재귀 방지)

  // 0. placeholder 등록 — 순환 참조 시 무한 재귀 방지
  const placeholder: SealedExecutors<T> = {
    _deserialize: _sealInProgressThrow,
    _serialize: _sealInProgressThrow,
    _isAsync: false,
    _isSerializeAsync: false,
  };
  (Class as any)[SEALED] = placeholder;

  // 1. 상속 메타데이터 병합
  const merged = mergeInheritance(Class);

  // 1a. 금지된 필드명 검사 — prototype pollution 방지 (C5)
  const BANNED_FIELD_NAMES = ['__proto__', 'constructor', 'prototype'];
  for (const key of Object.keys(merged)) {
    if (BANNED_FIELD_NAMES.includes(key)) {
      throw new SealError(`${Class.name}: field name '${key}' is not allowed (reserved property name)`);
    }
  }

  // 1b. TypeDef 정규화 — @Type/@Field type fn() 해석, 배열 감지, DTO 자동 nested 추론
  const PRIMITIVE_CTORS = new Set<Function>([Number, String, Boolean, Date]);
  for (const meta of Object.values(merged)) {
    if (!meta.type?.fn) continue;
    const typeResult = meta.type.fn();
    const isArray = Array.isArray(typeResult);
    const resolved = isArray ? (typeResult as any[])[0] : typeResult;
    if (resolved == null || typeof resolved !== 'function') {
      throw new SealError(`${Class.name}: @Type/@Field type must return a constructor or [constructor], got ${String(resolved)}`);
    }
    meta.type.isArray = isArray;
    if (!PRIMITIVE_CTORS.has(resolved)) {
      meta.type.resolvedClass = resolved;
      // DTO 클래스면 자동으로 validateNested 플래그 설정
      if (!meta.flags.validateNested) meta.flags.validateNested = true;
      if (isArray && !meta.flags.validateNestedEach) meta.flags.validateNestedEach = true;
    }
  }

  // 2. @Expose 스택 정적 검증 (실패 시 SealError throw)
  validateExposeStacks(merged, Class.name);

  // 3. 순환 참조 정적 분석
  const needsCircularCheck = analyzeCircular(Class, merged, options);

  // 4. 중첩 @Type 참조 DTO 먼저 봉인 (재귀) — resolvedClass 사용
  for (const meta of Object.values(merged)) {
    if (meta.type?.resolvedClass) {
      sealOne(meta.type.resolvedClass, options);
    }
    if (meta.type?.discriminator) {
      for (const sub of meta.type.discriminator.subTypes) {
        sealOne(sub.value, options);
      }
    }
  }

  // 5. async 분석
  const isAsync = analyzeAsync(merged, 'deserialize');
  const isSerializeAsync = analyzeAsync(merged, 'serialize');

  // 6. deserialize executor 코드 생성
  const deserializeExecutor = buildDeserializeCode<T>(Class, merged, options, needsCircularCheck, isAsync);

  // 7. serialize executor 코드 생성
  const serializeExecutor = buildSerializeCode<T>(Class, merged, options, isSerializeAsync);

  // 8. placeholder를 실제 executor로 in-place 교체 (Object.assign으로 참조 무결성 보장)
  Object.assign(placeholder, {
    _deserialize: deserializeExecutor,
    _serialize: serializeExecutor,
    _isAsync: isAsync,
    _isSerializeAsync: isSerializeAsync,
    _merged: merged,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// mergeInheritance() — 상속 메타데이터 병합 (§4.2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Class의 prototype chain을 따라 RAW 메타데이터를 child-first로 병합한다.
 *
 * 병합 규칙:
 * - validation: union merge (부모+자식 모두 적용, 중복 rule 제거)
 * - transform: 자식 우선, 자식에 없으면 부모 계승
 * - expose: 자식 우선, 자식에 없으면 부모 계승
 * - exclude: 자식 우선, 자식에 없으면 부모 계승
 * - type: 자식 우선, 자식에 없으면 부모 계승
 * - flags: 자식 우선, 자식에 없는 각 플래그만 부모에서 보충
 */
export function mergeInheritance(Class: Function): RawClassMeta {
  // prototype chain을 따라 RAW가 있는 클래스 수집 (array 순서: child first)
  const chain: Function[] = [];
  let current: Function | null = Class;
  while (current && current !== Object) {
    if (Object.hasOwn(current as object, RAW)) chain.push(current);
    const proto = Object.getPrototypeOf(current);
    current = proto === current ? null : proto;
  }

  // child-first merge
  const merged: RawClassMeta = Object.create(null) as RawClassMeta;

  for (const ctor of chain) {
    const raw = (ctor as any)[RAW] as RawClassMeta;
    for (const [key, meta] of Object.entries(raw)) {
      if (!merged[key]) {
        // 필드 최초 등장 → shallow copy
        merged[key] = {
          validation: [...meta.validation],
          transform: [...meta.transform],
          expose: [...meta.expose],
          exclude: meta.exclude,
          type: meta.type,
          flags: { ...meta.flags },
          schema: typeof meta.schema === 'function' ? meta.schema : (meta.schema ? { ...meta.schema } : null),
        };
      } else {
        // 이미 자식에 존재 → 카테고리별 독립 병합 (§4.2)
        const m = merged[key];
        const p = meta;

        // validation: union merge (중복 rule 제거)
        for (const rd of p.validation) {
          if (!m.validation.some(d => d.rule === rd.rule)) {
            m.validation.push(rd);
          }
        }

        // transform: 자식에 없으면 부모 계승
        if (m.transform.length === 0 && p.transform.length > 0) {
          m.transform = [...p.transform];
        }

        // expose: 자식에 없으면 부모 계승
        if (m.expose.length === 0 && p.expose.length > 0) {
          m.expose = [...p.expose];
        }

        // exclude: 자식에 없으면 부모 계승
        if (m.exclude === null && p.exclude !== null) {
          m.exclude = p.exclude;
        }

        // type: 자식에 없으면 부모 계승
        if (m.type === null && p.type !== null) {
          m.type = p.type;
        }

        // flags: 자식 우선, 자식에 없는 플래그만 부모 보충
        const mf = m.flags;
        const pf = p.flags;
        if (pf.isOptional !== undefined && mf.isOptional === undefined) mf.isOptional = pf.isOptional;
        if (pf.isDefined !== undefined && mf.isDefined === undefined) mf.isDefined = pf.isDefined;
        if (pf.validateIf !== undefined && mf.validateIf === undefined) mf.validateIf = pf.validateIf;
        if (pf.isNullable !== undefined && mf.isNullable === undefined) mf.isNullable = pf.isNullable;
        if (pf.validateNested !== undefined && mf.validateNested === undefined) mf.validateNested = pf.validateNested;
        if (pf.validateNestedEach !== undefined && mf.validateNestedEach === undefined) mf.validateNestedEach = pf.validateNestedEach;

        // schema: 자식 우선, 자식에 없으면 부모 계승
        if (m.schema == null && p.schema != null) {
          m.schema = typeof p.schema === 'function' ? p.schema : { ...p.schema };
        } else if (m.schema != null && p.schema != null) {
          if (typeof m.schema === 'function') { /* 자식 함수형 유지 */ }
          else if (typeof p.schema === 'function') { /* 자식 객체형 유지 */ }
          else {
            for (const [sk, sv] of Object.entries(p.schema)) {
              if (!(sk in m.schema)) m.schema[sk] = sv;
            }
          }
        }
      }
    }
  }

  return merged;
}

// ─────────────────────────────────────────────────────────────────────────────
// __testing__ — 테스트 전용 export (TST-ACCESS 준수)
// ─────────────────────────────────────────────────────────────────────────────

export const __testing__ = {
  mergeInheritance,
};
