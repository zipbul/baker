// Public API — Core
export { createRule } from './src/create-rule';

// Decorators
export { Field, arrayOf } from './src/decorators/index';
export type { FieldOptions, ArrayOfMarker } from './src/decorators/index';

// Baker — multi-app isolation boundary (`new Baker(config?)`)
export { Baker } from './src/baker';

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
