import { RAW } from '../symbols';
import { SealError } from '../errors';
import type { RawClassMeta } from '../types'; // used in walk() cast

/**
 * Static analysis for circular references (§4.6)
 *
 * Traverses the @Type reference graph via DFS to detect cycles.
 *
 * Flat DTO without cycles → false (zero WeakSet overhead)
 * DTO with cycles → true (WeakSet automatically inserted)
 */
export function analyzeCircular(
  Class: Function,
): boolean {
  // @Type reference graph DFS — detect back-edges via visited set
  const visited = new Set<Function>();

  function walk(cls: Function): boolean {
    if (visited.has(cls)) return true; // back-edge → cycle detected

    visited.add(cls);

    const raw = (cls as any)[RAW] as RawClassMeta | undefined;
    if (raw) {
      for (const meta of Object.values(raw)) {
        // Simple @Type
        if (meta.type?.fn) {
          let typeResult: unknown;
          try {
            typeResult = meta.type.fn();
          } catch (e) {
            throw new SealError(`${cls.name}: type function threw: ${(e as Error).message}`);
          }
          const nested = Array.isArray(typeResult) ? typeResult[0] : typeResult;
          if (walk(nested as Function)) return true;
        }
        // discriminator subTypes
        if (meta.type?.discriminator) {
          for (const sub of meta.type.discriminator.subTypes) {
            if (walk(sub.value)) return true;
          }
        }
      }
    }

    visited.delete(cls); // Release tree edge — prevent false positives for diamond patterns
    return false;
  }

  return walk(Class);
}
