import type { Transformer } from '../types';

export const trimTransformer: Transformer = {
  deserialize: ({ value }) => typeof value === 'string' ? value.trim() : value,
  serialize: ({ value }) => typeof value === 'string' ? value.trim() : value,
};

export const toLowerCaseTransformer: Transformer = {
  deserialize: ({ value }) => typeof value === 'string' ? value.toLowerCase() : value,
  serialize: ({ value }) => typeof value === 'string' ? value.toLowerCase() : value,
};

export const toUpperCaseTransformer: Transformer = {
  deserialize: ({ value }) => typeof value === 'string' ? value.toUpperCase() : value,
  serialize: ({ value }) => typeof value === 'string' ? value.toUpperCase() : value,
};
