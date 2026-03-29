// Public API — Core
export { deserialize } from './src/functions/deserialize';
export { validate } from './src/functions/validate';
export { serialize } from './src/functions/serialize';
export { toJsonSchema } from './src/functions/to-json-schema';
export { configure } from './src/configure';
export { createRule } from './src/create-rule';

// Decorators
export { Field, arrayOf } from './src/decorators/index';
export type { FieldOptions, FieldTransformParams, JsonSchemaOverride, ArrayOfMarker } from './src/decorators/index';

// Errors
export type { BakerError, BakerErrors } from './src/errors';
export { isBakerError, BAKER_ERROR, SealError } from './src/errors';

// Types
export type { JsonSchema202012, EmittableRule } from './src/types';
export type { BakerConfig, ConfigureResult } from './src/configure';

// Interfaces / Options
export type { RuntimeOptions } from './src/interfaces';
export type { ToJsonSchemaOptions } from './src/functions/to-json-schema';
