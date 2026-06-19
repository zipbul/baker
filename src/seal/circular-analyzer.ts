import { BakerError } from '../common/errors';
import { getRaw } from '../metadata/meta-access';

/**
 * Static analysis for circular references (§4.6)
 *
 * Traverses the @Type reference graph via DFS to detect cycles.
 *
 * Flat DTO without cycles → false (zero WeakSet overhead)
 * DTO with cycles → true (WeakSet automatically inserted)
 */
export function analyzeCircular(Class: Function): boolean {
  // @Type reference graph DFS — detect back-edges via visited set
  const visited = new Set<Function>();

  function walk(cls: Function): boolean {
    if (visited.has(cls)) {
      return true;
    } // back-edge → cycle detected

    visited.add(cls);

    const raw = getRaw(cls);
    if (raw) {
      for (const meta of Object.values(raw)) {
        // Simple @Type
        if (meta.type?.fn) {
          let typeResult: unknown;
          try {
            typeResult = meta.type.fn();
          } catch (e) {
            throw new BakerError(`${cls.name}: type function threw: ${(e as Error).message}`, { cause: e });
          }
          const nested = Array.isArray(typeResult) ? typeResult[0] : typeResult;
          if (walk(nested as Function)) {
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
            throw new BakerError(`${cls.name}: collectionValue function threw: ${(e as Error).message}`, { cause: e });
          }
          if (typeof resolved === 'function' && walk(resolved as Function)) {
            return true;
          }
        }
      }
    }

    visited.delete(cls); // Release tree edge — prevent false positives for diamond patterns
    return false;
  }

  return walk(Class);
}
