import type { RawClassMeta } from './interfaces';

import { RAW } from '../symbols';

// `RAW` is imported as a VALUE (not `import type`) because it is used as a computed property key below.
// `RAW` is a `unique symbol` (symbols.ts), so `{ [RAW]?: ... }` is a valid computed key. This is the one
// sanctioned value-import inside a types file — MetaStore is the sole reader/writer of the RAW slot.

/** The TC39 decorator-metadata object that carries the baker RAW slot (`Class[Symbol.metadata]`). */
export type MetaObject = Record<PropertyKey, unknown> & { [RAW]?: RawClassMeta };

/** A class (constructor) viewed as a carrier of decorator metadata. */
export type MetaCarrier = Function & { [Symbol.metadata]?: MetaObject | null };
