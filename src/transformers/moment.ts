import type { MomentLike, MomentTransformerOptions, Transformer } from './interfaces';

import { BakerError } from '../common';
import { MOMENT_MISSING } from './constants';

async function momentTransformer(opts?: MomentTransformerOptions): Promise<Transformer> {
  let moment: typeof import('moment');
  try {
    moment = (await import('moment')).default;
  } catch (e) {
    // Only ERR_MODULE_NOT_FOUND ("not installed") maps to the peer-dep hint; a module that IS installed
    // but throws during evaluation must surface its real error, not a misleading "install it" message.
    if ((e as { code?: string }).code === 'ERR_MODULE_NOT_FOUND') {
      throw new BakerError(MOMENT_MISSING, { cause: e });
    }
    throw e;
  }
  // Hoist format option once so the serialize closure doesn't re-read opts per call
  const format = opts?.format;

  return {
    deserialize: ({ value }) => {
      if (typeof value === 'string' || value instanceof Date) {
        // Parse in UTC (moment.utc) so a zoneless string resolves to the same instant on every host —
        // local-time parsing would make serialized output machine-dependent. Matches luxon's UTC default.
        // Pass an unparseable value through untouched (symmetric with isoStringTransformer) rather
        // than returning an Invalid moment the validator cannot distinguish from a real one.
        const m = moment.utc(value);
        return m.isValid() ? m : value;
      }
      return value;
    },
    serialize: ({ value }) => {
      if (
        value &&
        typeof value === 'object' &&
        typeof (value as MomentLike).toISOString === 'function' &&
        typeof (value as MomentLike).format === 'function'
      ) {
        const v = value as MomentLike;
        return format ? v.format(format) : v.toISOString();
      }
      return value;
    },
  };
}

export { momentTransformer };
