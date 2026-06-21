import type { EmittableRule } from '../rules';
import type { ArrayOfMarker } from './interfaces';

/** A positional @Field argument — either a rule or an arrayOf(...) element-rules marker. */
export type RuleArg = EmittableRule | ArrayOfMarker;

/** The class-field decorator @Field returns — TC39 field decorators receive `undefined` as the value. */
export type FieldDecorator = (value: undefined, context: ClassFieldDecoratorContext) => void;
