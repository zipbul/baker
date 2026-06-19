import type { RawClassMeta, RawPropertyMeta } from '../metadata/types';
import type { SealedExecutors } from './types';

import { Direction } from '../common/enums';
import { isAsyncFunction } from '../common/utils';
import { PRIMITIVE_CTORS } from './constants';
import { mergeInheritance } from './merge-inheritance';

// ─────────────────────────────────────────────────────────────────────────────
// analyzeAsync — static analysis to determine if a sealed DTO requires an async executor (C1)
// ─────────────────────────────────────────────────────────────────────────────

export function analyzeAsync(
  merged: RawClassMeta,
  direction: Direction,
  resolve: (cls: Function) => SealedExecutors<unknown> | undefined,
  visited?: Set<Function>,
): boolean {
  const flag = direction === Direction.Deserialize ? 'isAsync' : 'isSerializeAsync';
  const seen = visited ?? new Set<Function>();

  // sealOne seals every nested DTO (step 4) before this runs (step 5). For a fully-sealed nested
  // class its `isAsync`/`isSerializeAsync` flag is authoritative and already accounts for ITS nested
  // classes — so trusting the flag propagates async through any nesting depth (re-deriving from
  // metadata would lose `resolvedClass` past depth 1). A class still being sealed carries a
  // placeholder executor (no `merged`); that only happens on a circular back-edge, where the flag
  // is not yet known — there we recurse into the class's own metadata, guarded by `seen`.
  const nestedIsAsync = (cls: Function): boolean => {
    if (seen.has(cls)) {
      return false;
    }
    seen.add(cls);
    const sealed = resolve(cls);
    if (sealed?.merged) {
      return sealed[flag] === true;
    }
    return analyzeAsync(mergeInheritance(cls), direction, resolve, seen);
  };

  for (const meta of Object.values(merged)) {
    // 1. createRule may return Promise<boolean> even without `async` syntax (deserialize only).
    if (direction === Direction.Deserialize && meta.validation.some(rd => rd.rule.isAsync)) {
      return true;
    }
    // 2. @Transform async — single-pass scan, avoids intermediate filter[] allocation
    for (const td of meta.transform) {
      if (direction === Direction.Deserialize ? td.options?.serializeOnly : td.options?.deserializeOnly) {
        continue;
      }
      if (td.isAsync ?? isAsyncFunction(td.fn)) {
        return true;
      }
    }
    // 3. nested DTOs (direct, Set/Map value, discriminator subtypes)
    if (nestedClassesOf(meta).some(nestedIsAsync)) {
      return true;
    }
  }
  return false;
}

/**
 * Nested DTO classes referenced by a field's type. Prefers normalized `resolved*` slots, but
 * falls back to resolving the raw `type.fn()` thunk — needed when `analyzeAsync` recurses into a
 * still-being-sealed class on a circular back-edge whose metadata was never normalized.
 */
export function nestedClassesOf(meta: RawPropertyMeta): Function[] {
  const t = meta.type;
  if (!t) {
    return [];
  }
  const out: Function[] = [];
  if (t.resolvedClass) {
    out.push(t.resolvedClass);
  }
  if (t.resolvedCollectionValue) {
    out.push(t.resolvedCollectionValue);
  }
  if (t.discriminator) {
    for (const sub of t.discriminator.subTypes) {
      out.push(sub.value);
    }
  }
  if (out.length === 0 && t.fn) {
    const result = t.fn();
    if (result === Map || result === Set) {
      const cv = t.collectionValue?.();
      if (typeof cv === 'function' && !PRIMITIVE_CTORS.has(cv)) {
        out.push(cv);
      }
    } else {
      const resolved = Array.isArray(result) ? (result as unknown[])[0] : result;
      if (typeof resolved === 'function' && !PRIMITIVE_CTORS.has(resolved)) {
        out.push(resolved as Function);
      }
    }
  }
  return out;
}
