export interface TransformParams {
  value: unknown;
  key: string;
  obj: Record<string, unknown>;
}

// A transform may return its value synchronously or as a Promise (awaited by the codegen when the
// field is async). The return type is `unknown` — `unknown` already subsumes `Promise<unknown>`, so a
// `| Promise<unknown>` union would collapse to `unknown` and signal nothing.
export interface Transformer {
  deserialize(params: TransformParams): unknown;
  serialize(params: TransformParams): unknown;
}
