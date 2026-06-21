import type { FieldOptions } from './interfaces';

// Brand symbol for the arrayOf() element-rules marker. Globally registered (Symbol.for) so a
// bundler-duplicated copy of baker still recognizes a marker produced by the other copy.
export const ARRAY_OF = Symbol.for('baker:arrayOf');

// The valid FieldOptions keys — the single source used to tell an options object apart from a
// positional rule/marker. Built from a `Record<keyof FieldOptions, true>` literal so a new (or
// removed) FieldOptions field is a COMPILE error here until this set is updated; exposed as a
// `Set<string>` so membership tests against arbitrary input keys need no cast.
export const FIELD_OPTION_KEYS: ReadonlySet<string> = new Set<string>(
  Object.keys({
    type: true,
    discriminator: true,
    keepDiscriminatorProperty: true,
    rules: true,
    optional: true,
    nullable: true,
    name: true,
    deserializeName: true,
    serializeName: true,
    exclude: true,
    groups: true,
    when: true,
    transform: true,
    message: true,
    context: true,
    mapValue: true,
    setValue: true,
  } satisfies Record<keyof FieldOptions, true>),
);
