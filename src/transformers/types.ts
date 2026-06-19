export interface TransformParams {
  value: unknown;
  key: string;
  obj: Record<string, unknown>;
}

export interface Transformer {
  deserialize(params: TransformParams): unknown | Promise<unknown>;
  serialize(params: TransformParams): unknown | Promise<unknown>;
}

/** Internal — direction-specific transform function stored after @Field processing */
export type TransformFunction = (params: TransformParams) => unknown | Promise<unknown>;
