import type { RawClassMeta } from './types';

import { RAW } from './symbols';

// Type boundary — the single place that bridges symbol-keyed storage to typed metadata.
// All other modules must access RAW slots through these helpers only.
//
// RAW lives on the TC39 decorator metadata object (Class[Symbol.metadata][RAW]) — that is
// where modern field decorators can write (they receive `context.metadata`, never the class).
// Sealed executors live in each Baker's own map (keyed by class), never on the class itself.
type MetaObject = Record<PropertyKey, unknown> & { [RAW]?: RawClassMeta };
type MetaCarrier = Function & { [Symbol.metadata]?: MetaObject | null };

/** Returns the metadata object visible on cls (own or inherited via the class prototype chain). */
function metaOf(cls: Function): MetaObject | undefined {
  return (cls as MetaCarrier)[Symbol.metadata] ?? undefined;
}

/** Returns the class's own metadata object, creating one if absent. */
function ensureOwnMeta(cls: Function): MetaObject {
  if (!Object.hasOwn(cls, Symbol.metadata)) {
    Object.defineProperty(cls, Symbol.metadata, {
      value: {} as MetaObject,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
  return (cls as MetaCarrier)[Symbol.metadata]!;
}

export function deleteRaw(cls: Function): void {
  if (Object.hasOwn(cls, Symbol.metadata)) {
    delete (cls as MetaCarrier)[Symbol.metadata]![RAW];
  }
}

export function getRaw(cls: Function): RawClassMeta | undefined {
  return metaOf(cls)?.[RAW];
}

/** Same as getRaw but throws if the class has no @Field decorators — for callers that establish the invariant elsewhere. */
export function requireRaw(cls: Function): RawClassMeta {
  const v = getRaw(cls);
  if (v === undefined) {
    throw new Error(`${cls.name || '<anonymous>'}: class has no @Field decorators`);
  }
  return v;
}

export function setRaw(cls: Function, raw: RawClassMeta): void {
  ensureOwnMeta(cls)[RAW] = raw;
}

/**
 * True only when cls has its OWN RAW slot. A subclass without its own @Field decorators
 * resolves Class[Symbol.metadata] to the parent's metadata via the class prototype chain;
 * the dual own-check keeps mergeInheritance from double-counting inherited fields.
 */
export function hasRawOwn(cls: Function): boolean {
  if (!Object.hasOwn(cls, Symbol.metadata)) {
    return false;
  }
  const meta = (cls as MetaCarrier)[Symbol.metadata];
  return meta != null && Object.hasOwn(meta, RAW);
}
