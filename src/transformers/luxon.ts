import type { LuxonLike, LuxonTransformerOptions, Transformer } from './interfaces';

import { LUXON_MISSING } from './constants';
import { loadPeerDependency } from './peer-dependency';

async function luxonTransformer(opts?: LuxonTransformerOptions): Promise<Transformer> {
  const luxon = await loadPeerDependency<typeof import('luxon')>(() => import('luxon'), LUXON_MISSING);
  const { DateTime } = luxon;
  const zone = opts?.zone ?? 'utc';
  // Hoist format option once so the serialize closure doesn't re-read opts per call
  const format = opts?.format;

  return {
    deserialize: ({ value }) => {
      // Mirror momentTransformer: an unparseable input must pass through untouched, never become an
      // Invalid DateTime (which would serialize to null / "Invalid DateTime" and corrupt the data).
      if (typeof value === 'string') {
        const dt = DateTime.fromISO(value, { zone });
        return dt.isValid ? dt : value;
      }
      if (value instanceof Date) {
        const dt = DateTime.fromJSDate(value, { zone });
        return dt.isValid ? dt : value;
      }
      return value;
    },
    serialize: ({ value }) => {
      // Require both methods (like the moment transformer) so an unrelated object exposing only a
      // `toISO` method is not mistaken for a Luxon DateTime and mangled.
      if (
        value &&
        typeof value === 'object' &&
        typeof (value as LuxonLike).toISO === 'function' &&
        typeof (value as LuxonLike).toFormat === 'function'
      ) {
        const v = value as LuxonLike;
        return format ? v.toFormat(format) : v.toISO();
      }
      return value;
    },
  };
}

export { luxonTransformer };
