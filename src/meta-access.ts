import type { RawClassMeta, SealedExecutors } from './types';

import { RAW, SEALED } from './symbols';

// Type boundary — the single place that bridges symbol-keyed storage to typed metadata.
// All other modules must access RAW/SEALED slots through these helpers only.
// Carriers extend Function so the cast in helpers below is a single direct
// narrowing (`cls as SealedCarrier`), not `as unknown as ...` laundering.
// Every Function structurally satisfies "Function with optional symbol slot".
type SealedCarrier = Function & { [SEALED]?: SealedExecutors<unknown> };
type RawCarrier = Function & { [RAW]?: RawClassMeta };

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
  delete (cls as RawCarrier)[RAW];
}

export function getRaw(cls: Function): RawClassMeta | undefined {
  return (cls as RawCarrier)[RAW];
}

/** Same as getRaw but throws if the class has no @Field decorators — for callers that establish the invariant elsewhere. */
export function requireRaw(cls: Function): RawClassMeta {
  const v = (cls as RawCarrier)[RAW];
  if (v === undefined) {
    throw new Error(`${cls.name || '<anonymous>'}: class has no @Field decorators`);
  }
  return v;
}

export function setRaw(cls: Function, raw: RawClassMeta): void {
  (cls as RawCarrier)[RAW] = raw;
}

export function hasRawOwn(cls: Function): boolean {
  return Object.hasOwn(cls, RAW);
}

export function freezeRaw(cls: Function): void {
  const raw = getRaw(cls);
  if (raw) {
    Object.freeze(raw);
  }
}
