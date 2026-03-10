// Public API — Core
export { deserialize } from './src/functions/deserialize';
export { serialize } from './src/functions/serialize';
export { toJsonSchema } from './src/functions/to-json-schema';
export { configure } from './src/configure';
export { createRule } from './src/create-rule';

// Decorators
export { Field, Expose, Exclude, Transform, Type, arrayOf } from './src/decorators/index';
export type { FieldOptions, FieldTransformParams, JsonSchemaOverride, ArrayOfMarker } from './src/decorators/index';
export type { ExposeOptions, ExcludeOptions, TransformOptions, TypeOptions } from './src/decorators/index';

// Errors
export type { BakerError } from './src/errors';
export { BakerValidationError, SealError } from './src/errors';

// Types
export type { JsonSchema202012 } from './src/types';
export type { BakerConfig } from './src/configure';

// Interfaces / Options
export type { RuntimeOptions } from './src/interfaces';
export type { ToJsonSchemaOptions } from './src/functions/to-json-schema';
