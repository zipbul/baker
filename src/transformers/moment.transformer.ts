import type { Transformer } from '../types';

export interface MomentTransformerOptions {
  format?: string;
}

export async function momentTransformer(opts?: MomentTransformerOptions): Promise<Transformer> {
  const moment = (await import('moment')).default;

  return {
    deserialize: ({ value }) => {
      if (typeof value === 'string' || value instanceof Date) return moment(value);
      return value;
    },
    serialize: ({ value }) => {
      if (value && typeof value === 'object' && typeof (value as any).toISOString === 'function' && typeof (value as any).format === 'function') {
        return opts?.format ? (value as any).format(opts.format) : (value as any).toISOString();
      }
      return value;
    },
  };
}
