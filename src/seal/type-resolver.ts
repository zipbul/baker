import { CollectionType } from '../metadata';

/**
 * Classification of a `@Type`/`@Field` `type` thunk's return value. The single reading of the
 * Map/Set marker + array-unwrap that seal normalization, circular analysis, and async analysis all
 * share — each caller then applies its OWN primitive-exclusion and error policy to `resolved` (seal
 * throws on a non-constructor; the analyzers skip it), so only the classification lives here.
 */
export interface ClassifiedType {
  /** Set when the thunk returned the `Map` or `Set` constructor (a collection field). */
  collection?: CollectionType;
  /** True when the thunk returned the array form `[Element]`. */
  isArray: boolean;
  /** The element value (array-unwrapped), or `undefined` for a Map/Set collection. */
  resolved: unknown;
}

export function classifyTypeResult(result: unknown): ClassifiedType {
  if (result === Map) {
    return { collection: CollectionType.Map, isArray: false, resolved: undefined };
  }
  if (result === Set) {
    return { collection: CollectionType.Set, isArray: false, resolved: undefined };
  }
  const isArray = Array.isArray(result);
  return { isArray, resolved: isArray ? (result as unknown[])[0] : result };
}
