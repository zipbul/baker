import type { LuxonLike, LuxonTransformerOptions, Transformer } from './interfaces';

import { BakerError } from '../common';
import { LUXON_MISSING } from './constants';

async function luxonTransformer(opts?: LuxonTransformerOptions): Promise<Transformer> {
  let luxon: typeof import('luxon');
  try {
    luxon = await import('luxon');
  } catch (e) {
    // Only ERR_MODULE_NOT_FOUND ("not installed") maps to the peer-dep hint; any other error (a module
    // that IS installed but threw during evaluation) surfaces untouched, not a misleading "install it".
    throw (e as { code?: string }).code === 'ERR_MODULE_NOT_FOUND' ? new BakerError(LUXON_MISSING, { cause: e }) : e;
  }
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
