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

export interface LuxonTransformerOptions {
  format?: string;
  zone?: string;
}

/** Structural shape of a Luxon DateTime — both methods required so an unrelated object isn't mangled. */
export interface LuxonLike {
  toISO(): string;
  toFormat(f: string): string;
}

export interface MomentTransformerOptions {
  format?: string;
}

/** Structural shape of a Moment — both methods required so an unrelated object isn't mangled. */
export interface MomentLike {
  toISOString(): string;
  format(f: string): string;
}
