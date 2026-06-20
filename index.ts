// Public API — Core
export { createRule } from './src/rules';

// Decorators
export { Field, arrayOf } from './src/decorators';
export type { FieldOptions, ArrayOfMarker } from './src/decorators';

// Baker — multi-app isolation boundary (`new Baker(config?)`)
export { Baker } from './src/baker';

// Enums
export { ExcludeMode } from './src/decorators';
export { RequiredType } from './src/rules';

// Errors
export type { BakerIssue, BakerIssueSet } from './src/common';
export { isBakerIssueSet, BakerError } from './src/common';

// Types
export type { EmittableRule } from './src/rules';
export type { Transformer, TransformParams } from './src/transformers';
export type { BakerConfig } from './src/config';

// Interfaces / Options
export type { RuntimeOptions } from './src/common';
