import type { Transformer } from '../types';

interface LuxonTransformerOptions {
  format?: string;
  zone?: string;
}

interface LuxonLike {
  toISO(): string;
  toFormat(f: string): string;
}

async function luxonTransformer(opts?: LuxonTransformerOptions): Promise<Transformer> {
  const { DateTime } = await import('luxon');
  const zone = opts?.zone ?? 'utc';
  // Hoist format option once so the serialize closure doesn't re-read opts per call
  const format = opts?.format;

  return {
    deserialize: ({ value }) => {
      if (typeof value === 'string') {
        return DateTime.fromISO(value, { zone });
      }
      if (value instanceof Date) {
        return DateTime.fromJSDate(value, { zone });
      }
      return value;
    },
    serialize: ({ value }) => {
      if (value && typeof value === 'object' && typeof (value as LuxonLike).toISO === 'function') {
        const v = value as LuxonLike;
        return format ? v.toFormat(format) : v.toISO();
      }
      return value;
    },
  };
}

export type { LuxonTransformerOptions };
export { luxonTransformer };
