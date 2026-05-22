import type { Transformer } from '../types';

interface MomentTransformerOptions {
  format?: string;
}

interface MomentLike {
  toISOString(): string;
  format(f: string): string;
}

async function momentTransformer(opts?: MomentTransformerOptions): Promise<Transformer> {
  let moment: typeof import('moment');
  try {
    moment = (await import('moment')).default;
  } catch {
    throw new Error("momentTransformer requires the optional peer dependency 'moment'. Install it with: bun add moment");
  }
  // Hoist format option once so the serialize closure doesn't re-read opts per call
  const format = opts?.format;

  return {
    deserialize: ({ value }) => {
      if (typeof value === 'string' || value instanceof Date) {
        return moment(value);
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
