import type { Transformer } from '../types';

export function roundTransformer(precision = 0): Transformer {
  const factor = Math.pow(10, precision);
  const round = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? Math.round(v * factor) / factor : v;
  return {
    deserialize: ({ value }) => round(value),
    serialize: ({ value }) => round(value),
  };
}
