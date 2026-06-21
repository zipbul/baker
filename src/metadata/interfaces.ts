import type { ClassCtor } from '../common';
import type { InternalRule } from '../rules';
import type { TransformFunction } from '../transformers';
import type { CollectionType } from './enums';

// ─────────────────────────────────────────────────────────────────────────────
// RuleDef / TransformDef / ExposeDef / ExcludeDef / TypeDef
// ─────────────────────────────────────────────────────────────────────────────

/** Arguments for user-defined message callback */
export interface MessageArgs {
  property: string;
  value: unknown;
  constraints: Record<string, unknown>;
}

export interface RuleDef {
  rule: InternalRule;
  each?: boolean;
  groups?: string[];
  /** Value to include in BakerIssue.message on validation failure */
  message?: string | ((args: MessageArgs) => string);
  /** Arbitrary value to include in BakerIssue.context on validation failure */
  context?: unknown;
}

export interface TransformDef {
  fn: TransformFunction;
  isAsync?: boolean;
  options?: {
    groups?: string[];
    deserializeOnly?: boolean;
    serializeOnly?: boolean;
  };
}

export interface ExposeDef {
  name?: string;
  groups?: string[];
  deserializeOnly?: boolean;
  serializeOnly?: boolean;
}

export interface ExcludeDef {
  deserializeOnly?: boolean;
  serializeOnly?: boolean;
}

export interface TypeDef {
  fn: () => ClassCtor | ClassCtor[] | MapConstructor | SetConstructor;
  discriminator?: {
    property: string;
    subTypes: { value: Function; name: string }[];
  };
  keepDiscriminatorProperty?: boolean;
  /** seal-time normalization result — true if fn() returns an array */
  isArray?: boolean;
  /** seal-time normalization result — cached class after resolving fn() (DTOs only, excluding primitives) */
  resolvedClass?: ClassCtor;
  /** seal-time normalization result — Map or Set collection type */
  collection?: CollectionType;
  /** Nested DTO class thunk for Map value / Set element */
  collectionValue?: () => ClassCtor;
  /** seal-time normalization result — cached class after resolving collectionValue */
  resolvedCollectionValue?: ClassCtor;
}

// ─────────────────────────────────────────────────────────────────────────────
// PropertyFlags — presence/nullability/conditional flags from @Field options + seal-time nested analysis
// ─────────────────────────────────────────────────────────────────────────────

export interface PropertyFlags {
  /** `@Field({ optional })` — skip all validation when undefined/null */
  isOptional?: boolean;
  /** `@Field({ nullable })` — allow and assign null, reject undefined */
  isNullable?: boolean;
  /** `@Field({ when })` — skip all field validation when the predicate returns false */
  validateIf?: (obj: Record<string, unknown>) => boolean;
  /** Seal-derived — trigger recursive validation for nested `@Field({ type })` DTOs */
  validateNested?: boolean;
  /** Seal-derived — validate nested DTOs per array element */
  validateNestedEach?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// RawPropertyMeta — Collection data stored in Class[Symbol.metadata][RAW][propertyKey]
// ─────────────────────────────────────────────────────────────────────────────

export interface RawPropertyMeta {
  validation: RuleDef[];
  transform: TransformDef[];
  expose: ExposeDef[];
  exclude: ExcludeDef | null;
  type: TypeDef | null;
  flags: PropertyFlags;
  /** Field-level message applied to ALL failures of this field (gate/structural/required/conversion/rule) */
  message?: string | ((args: MessageArgs) => string);
  /** Field-level context attached to ALL failures of this field */
  context?: unknown;
}

export interface RawClassMeta {
  [propertyKey: string]: RawPropertyMeta;
}
