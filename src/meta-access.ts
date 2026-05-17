import type { RawClassMeta, SealedExecutors } from './types';

import { RAW, SEALED } from './symbols';

// Type boundary — the single place that bridges symbol-keyed storage to typed metadata.
// All other modules must access RAW/SEALED slots through these helpers only.
type SealedCarrier = { [SEALED]?: SealedExecutors<unknown> };
type RawCarrier = { [RAW]?: RawClassMeta };

export function getSealed(cls: Function): SealedExecutors<unknown> | undefined {
  return (cls as unknown as SealedCarrier)[SEALED];
}

export function setSealed(cls: Function, exec: SealedExecutors<unknown>): void {
  (cls as unknown as SealedCarrier)[SEALED] = exec;
}

export function hasSealedOwn(cls: Function): boolean {
  return Object.hasOwn(cls, SEALED);
}

export function deleteSealed(cls: Function): void {
  delete (cls as unknown as SealedCarrier)[SEALED];
}

export function getRaw(cls: Function): RawClassMeta | undefined {
  return (cls as unknown as RawCarrier)[RAW];
}

export function setRaw(cls: Function, raw: RawClassMeta): void {
  (cls as unknown as RawCarrier)[RAW] = raw;
}

export function hasRawOwn(cls: Function): boolean {
  return Object.hasOwn(cls, RAW);
}

export function freezeRaw(cls: Function): void {
  const raw = getRaw(cls);
  if (raw) {Object.freeze(raw);}
}
