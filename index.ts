// Public API — Core
export { createRule } from './src/rules/create-rule';

// Decorators
export { Field, arrayOf } from './src/decorators/index';
export type { FieldOptions, ArrayOfMarker } from './src/decorators/index';

// Baker — multi-app isolation boundary (`new Baker(config?)`)
export { Baker } from './src/baker';

// Enums
export { ExcludeMode } from './src/decorators/enums';
export { RequiredType } from './src/rules/enums';

// Errors
export type { BakerIssue, BakerIssueSet } from './src/common/errors';
export { isBakerIssueSet, BakerError } from './src/common/errors';

// Types
export type { EmittableRule } from './src/rules/types';
export type { Transformer, TransformParams } from './src/transformers/types';
export type { BakerConfig } from './src/config/configure';

// Interfaces / Options
export type { RuntimeOptions } from './src/common/interfaces';
