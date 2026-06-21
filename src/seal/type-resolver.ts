import type { ClassifiedType } from './interfaces';

import { CollectionType } from '../metadata';

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
