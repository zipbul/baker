import type { RawClassMeta, RawPropertyMeta } from '../metadata';
import type { SealedExecutors } from './interfaces';
import type { InheritanceMerger } from './inheritance-merger';

import { Direction, isAsyncFunction } from '../common';
import { PRIMITIVE_CTORS } from './constants';
import { classifyTypeResult } from './type-resolver';

/**
 * Static analysis to determine if a sealed DTO requires an async executor (C1). Holds the executor
 * resolver (the Baker's per-instance map reader) and the {@link InheritanceMerger} as injected
 * collaborators.
 */
export class AsyncAnalyzer {
  readonly #resolve: (cls: Function) => SealedExecutors<unknown> | undefined;
  readonly #merger: InheritanceMerger;

  constructor(resolve: (cls: Function) => SealedExecutors<unknown> | undefined, merger: InheritanceMerger) {
    this.#resolve = resolve;
    this.#merger = merger;
  }

  analyze(merged: RawClassMeta, direction: Direction, visited?: Set<Function>): boolean {
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
      const sealed = this.#resolve(cls);
      if (sealed?.merged) {
        return sealed[flag] === true;
      }
      return this.analyze(this.#merger.merge(cls), direction, seen);
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
      if (this.nestedClassesOf(meta).some(nestedIsAsync)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Nested DTO classes referenced by a field's type. Prefers normalized `resolved*` slots, but falls
   * back to resolving the raw `type.fn()` thunk — needed when {@link analyze} recurses into a
   * still-being-sealed class on a circular back-edge whose metadata was never normalized.
   */
  nestedClassesOf(meta: RawPropertyMeta): Function[] {
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
      const { collection, resolved } = classifyTypeResult(t.fn());
      if (collection !== undefined) {
        const cv = t.collectionValue?.();
        if (typeof cv === 'function' && !PRIMITIVE_CTORS.has(cv)) {
          out.push(cv);
        }
      } else if (typeof resolved === 'function' && !PRIMITIVE_CTORS.has(resolved)) {
        out.push(resolved as Function);
      }
    }
    return out;
  }
}
