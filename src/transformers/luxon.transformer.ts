import type { Transformer } from '../types';

export interface LuxonTransformerOptions {
  format?: string;
  zone?: string;
}

export async function luxonTransformer(opts?: LuxonTransformerOptions): Promise<Transformer> {
  const { DateTime } = await import('luxon');
  const zone = opts?.zone ?? 'utc';

  return {
    deserialize: ({ value }) => {
      if (typeof value === 'string') return DateTime.fromISO(value, { zone });
      if (value instanceof Date) return DateTime.fromJSDate(value, { zone });
      return value;
    },
    serialize: ({ value }) => {
      if (value && typeof value === 'object' && typeof (value as any).toISO === 'function') {
        return opts?.format ? (value as any).toFormat(opts.format) : (value as any).toISO();
      }
      return value;
    },
  };
}
