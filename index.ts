// Public API — Core
export { deserialize, deserializeSync, deserializeAsync } from './src/functions/deserialize';
export { validate, validateSync, validateAsync } from './src/functions/validate';
export { serialize, serializeSync, serializeAsync } from './src/functions/serialize';
export { configure } from './src/configure';
export { createRule } from './src/create-rule';
export { seal } from './src/seal/seal';

// Decorators
export { Field, arrayOf, Recipe } from './src/decorators/index';
export type { FieldOptions, ArrayOfMarker } from './src/decorators/index';

// Baker scopes (multi-app isolation)
export { createBaker } from './src/baker';
export type { Baker } from './src/baker';

// Enums
export { ExcludeMode, RequiredType } from './src/enums';

// Errors
export type { BakerIssue, BakerIssueSet } from './src/errors';
export { isBakerIssueSet, BakerError } from './src/errors';

// Types
export type { EmittableRule, Transformer, TransformParams } from './src/types';
export type { BakerConfig } from './src/configure';

// Interfaces / Options
export type { RuntimeOptions } from './src/interfaces';
