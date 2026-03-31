import type { Transformer } from '../types';

export function csvTransformer(separator = ','): Transformer {
  return {
    deserialize: ({ value }) => typeof value === 'string' ? value.split(separator) : value,
    serialize: ({ value }) => Array.isArray(value) ? value.join(separator) : value,
  };
}

export const jsonTransformer: Transformer = {
  deserialize: ({ value }) => {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); }
    catch { return value; }
  },
  serialize: ({ value }) => {
    if (value != null && typeof value === 'object') return JSON.stringify(value);
    return value;
  },
};
