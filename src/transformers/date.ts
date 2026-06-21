import type { Transformer } from './interfaces';

export const unixSecondsTransformer: Transformer = {
  // Pass non-numbers and non-finite numbers (NaN/Infinity → Invalid Date) through untouched, so the
  // validator sees the original value — symmetric with isoStringTransformer.
  deserialize: ({ value }) => {
    if (typeof value !== 'number') {
      return value;
    }
    const d = new Date(value * 1000);
    return Number.isNaN(d.getTime()) ? value : d;
  },
  serialize: ({ value }) => (value instanceof Date ? Math.floor(value.getTime() / 1000) : value),
};

export const unixMillisTransformer: Transformer = {
  deserialize: ({ value }) => {
    if (typeof value !== 'number') {
      return value;
    }
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d;
  },
  serialize: ({ value }) => (value instanceof Date ? value.getTime() : value),
};

export const isoStringTransformer: Transformer = {
  deserialize: ({ value }) => {
    if (typeof value !== 'string') {
      return value;
    }
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d;
  },
  serialize: ({ value }) => (value instanceof Date ? value.toISOString() : value),
};
