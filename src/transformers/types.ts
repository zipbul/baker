import type { TransformParams } from './interfaces';

/** Internal — direction-specific transform function stored after @Field processing */
export type TransformFunction = (params: TransformParams) => unknown;
