import type { RawClassMeta, SealedExecutors } from './types';

import { RAW, SEALED } from './symbols';

// Type boundary — the single place that bridges symbol-keyed storage to typed metadata.
// All other modules must access RAW/SEALED slots through these helpers only.
//
// RAW lives on the TC39 decorator metadata object (Class[Symbol.metadata][RAW]) — that is
// where modern field decorators can write (they receive `context.metadata`, never the class).
// SEALED lives directly on the Class (Class[SEALED]); seal() runs with the class in hand.
type MetaObject = Record<PropertyKey, unknown> & { [RAW]?: RawClassMeta };
type MetaCarrier = Function & { [Symbol.metadata]?: MetaObject | null };
type SealedCarrier = Function & { [SEALED]?: SealedExecutors<unknown> };

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

export function getSealed(cls: Function): SealedExecutors<unknown> | undefined {
  return (cls as SealedCarrier)[SEALED];
}

/** Same as getSealed but throws if the class is not sealed — for callers that establish the invariant elsewhere. */
export function requireSealed(cls: Function): SealedExecutors<unknown> {
  const v = (cls as SealedCarrier)[SEALED];
  if (v === undefined) {
    throw new Error(`${cls.name || '<anonymous>'}: class is not sealed`);
  }
  return v;
}

export function setSealed(cls: Function, exec: SealedExecutors<unknown>): void {
  (cls as SealedCarrier)[SEALED] = exec;
}

export function hasSealedOwn(cls: Function): boolean {
  return Object.hasOwn(cls, SEALED);
}

export function deleteSealed(cls: Function): void {
  delete (cls as SealedCarrier)[SEALED];
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

export function freezeRaw(cls: Function): void {
  // Guard on own RAW: an inherited-only subclass must not freeze the parent's RAW.
  if (!hasRawOwn(cls)) {
    return;
  }
  Object.freeze(getRaw(cls));
}
