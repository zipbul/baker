import type { InheritanceMerger } from './inheritance-merger';

import { BakerError } from '../common';

/**
 * Static analysis for circular references. Traverses the @Type reference graph via DFS to detect
 * cycles; holds the {@link InheritanceMerger} it reads the merged graph through as an injected collaborator.
 *
 * Flat DTO without cycles → false (zero WeakSet overhead). DTO with cycles → true (WeakSet inserted).
 */
export class CircularAnalyzer {
  readonly #merger: InheritanceMerger;

  constructor(merger: InheritanceMerger) {
    this.#merger = merger;
  }

  analyze(Class: Function): boolean {
    // Directed-graph cycle detection: `onPath` = gray (classes on the current DFS path → a back-edge
    // to one is a cycle); `explored` = black (classes already proven acyclic → never re-walked, so a
    // shared subtree reached by many paths is visited once instead of exponentially).
    const onPath = new Set<Function>();
    const explored = new Set<Function>();
    const merger = this.#merger;

    function walk(cls: Function): boolean {
      if (onPath.has(cls)) {
        return true; // back-edge → cycle detected
      }
      if (explored.has(cls)) {
        return false; // already proven acyclic
      }

      onPath.add(cls);

      // Use the inheritance-MERGED metadata, not own-level RAW: a cycle introduced through an
      // INHERITED @Type field must be seen here, because codegen builds the circular guard from the
      // same merged graph (mirrors AsyncAnalyzer). Missing it would omit the WeakSet → stack overflow.
      const raw = merger.merge(cls);
      for (const meta of Object.values(raw)) {
        // Simple @Type
        if (meta.type?.fn) {
          let typeResult: unknown;
          try {
            typeResult = meta.type.fn();
          } catch (e) {
            throw new BakerError(`${cls.name}: type function threw: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
          }
          const nested = Array.isArray(typeResult) ? typeResult[0] : typeResult;
          if (typeof nested === 'function' && walk(nested)) {
            return true;
          }
        }
        // discriminator subTypes
        if (meta.type?.discriminator) {
          for (const sub of meta.type.discriminator.subTypes) {
            if (walk(sub.value)) {
              return true;
            }
          }
        }
        // W1 (F-1): collectionValue thunk (Set/Map nested DTO) — invoke and walk
        if (meta.type?.collectionValue) {
          let resolved: unknown;
          try {
            resolved = meta.type.collectionValue();
          } catch (e) {
            throw new BakerError(`${cls.name}: collectionValue function threw: ${e instanceof Error ? e.message : String(e)}`, {
              cause: e,
            });
          }
          if (typeof resolved === 'function' && walk(resolved)) {
            return true;
          }
        }
      }

      onPath.delete(cls); // leave the current path...
      explored.add(cls); // ...and record as fully explored & acyclic
      return false;
    }

    return walk(Class);
  }
}
