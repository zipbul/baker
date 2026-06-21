import type { Transformer } from './interfaces';

import { BakerError } from '../common';

interface MomentTransformerOptions {
  format?: string;
}

interface MomentLike {
  toISOString(): string;
  format(f: string): string;
}

const MOMENT_MISSING = "momentTransformer requires the optional peer dependency 'moment'. Install it with: bun add moment";

async function momentTransformer(opts?: MomentTransformerOptions): Promise<Transformer> {
  let moment: typeof import('moment');
  try {
    moment = (await import('moment')).default;
  } catch (e) {
    throw new BakerError(MOMENT_MISSING, { cause: e });
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

export type { MomentTransformerOptions };
export { momentTransformer };
