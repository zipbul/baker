import type { RawClassMeta, RawPropertyMeta } from './types';

import { RAW } from '../symbols';

type MetaObject = Record<PropertyKey, unknown> & { [RAW]?: RawClassMeta };

// ─────────────────────────────────────────────────────────────────────────────
// ensureMeta — Internal utility (§3.1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the RawPropertyMeta for the given propertyKey on the class's decorator metadata.
 * Creates the RAW slot and the per-key default meta if absent.
 *
 * The own-RAW check is required: a subclass's metadata inherits the parent's RAW via the
 * metadata prototype chain, so a bare assignment would pollute the parent. Creating a fresh
 * own RAW (null prototype) keeps child fields isolated.
 */
export function ensureMeta(metadata: MetaObject, key: string): RawPropertyMeta {
  if (!Object.hasOwn(metadata, RAW)) {
    metadata[RAW] = Object.create(null) as RawClassMeta;
  }
  const raw = metadata[RAW]!;

  return (raw[key] ??= {
    validation: [],
    transform: [],
    expose: [],
    exclude: null,
    type: null,
    flags: {},
  });
}
