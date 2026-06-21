import type { ClassCtor } from '../common';
import type { DiscriminatorDef } from '../metadata';
import type { EmittableRule } from '../rules';
import type { Transformer } from '../transformers';
import type { ExcludeMode } from './enums';
import { ARRAY_OF } from './constants';

// ─────────────────────────────────────────────────────────────────────────────
// arrayOf marker — produced by arrayOf(...), compiles to per-rule `each: true`
// ─────────────────────────────────────────────────────────────────────────────

export interface ArrayOfMarker {
  readonly [ARRAY_OF]: true;
  readonly rules: EmittableRule[];
}

// ─────────────────────────────────────────────────────────────────────────────
// FieldOptions — @Field options object
// ─────────────────────────────────────────────────────────────────────────────

export interface FieldOptions {
  /** Nested DTO type. Thunk — supports circular references. [Dto] for arrays. */
  type?: () => ClassCtor | ClassCtor[] | MapConstructor | SetConstructor;
  /** Polymorphic discriminator configuration — used with type */
  discriminator?: DiscriminatorDef;
  /** Whether to keep the discriminator property in the result object */
  keepDiscriminatorProperty?: boolean;
  /** Validation rules array */
  rules?: (EmittableRule | ArrayOfMarker)[];
  /** Allow undefined */
  optional?: boolean;
  /** Allow null */
  nullable?: boolean;
  /** JSON key mapping (bidirectional) */
  name?: string;
  /** Deserialize direction key mapping (cannot be used with name) */
  deserializeName?: string;
  /** Serialize direction key mapping (cannot be used with name) */
  serializeName?: string;
  /** Field exclusion — true: bidirectional, 'deserializeOnly': deserialization only, 'serializeOnly': serialization only */
  exclude?: boolean | ExcludeMode;
  /** Groups — field visibility control + conditional validation rule application */
  groups?: string[];
  /** Conditional validation — skip all field validation when false */
  when?: (obj: Record<string, unknown>) => boolean;
  /** Transformer or array of transformers (serialize direction applies in reverse order) */
  transform?: Transformer | Transformer[];
  /** Error message on validation failure — applied to all rules of the field (rule's own message takes precedence) */
  message?: string | ((args: { property: string; value: unknown; constraints: Record<string, unknown> }) => string);
  /** Error context on validation failure — applied to all rules of the field (rule's own context takes precedence) */
  context?: unknown;
  /** Nested DTO class thunk for Map values — used with type: () => Map */
  mapValue?: () => ClassCtor;
  /** Nested DTO class thunk for Set elements — used with type: () => Set */
  setValue?: () => ClassCtor;
}
