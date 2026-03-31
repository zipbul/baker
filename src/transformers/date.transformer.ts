import type { Transformer } from '../types';

export const unixSecondsTransformer: Transformer = {
  deserialize: ({ value }) => typeof value === 'number' ? new Date(value * 1000) : value,
  serialize: ({ value }) => value instanceof Date ? Math.floor(value.getTime() / 1000) : value,
};

export const unixMillisTransformer: Transformer = {
  deserialize: ({ value }) => typeof value === 'number' ? new Date(value) : value,
  serialize: ({ value }) => value instanceof Date ? value.getTime() : value,
};

export const isoStringTransformer: Transformer = {
  deserialize: ({ value }) => {
    if (typeof value !== 'string') return value;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d;
  },
  serialize: ({ value }) => value instanceof Date ? value.toISOString() : value,
};
