// Directory barrel — the FULL internal surface other domains import via `../transformers`.
// The published `./transformers` subpath points at `./public` (curated public surface) instead, so the
// internal `TransformFunction` re-export never leaks into the public API.

export * from './public';

// Internal surface — consumed cross-domain but NOT necessarily part of the published `./transformers`.
export type { Transformer, TransformParams } from './interfaces';
export type { TransformFunction } from './types';
