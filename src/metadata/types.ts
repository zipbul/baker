import type { ClassCtor } from '../common/types';
import type { InternalRule } from '../rules/types';
import type { TransformFunction } from '../transformers/types';
import type { CollectionType } from './enums';

// ─────────────────────────────────────────────────────────────────────────────
// RuleDef / TransformDef / ExposeDef / ExcludeDef / TypeDef (§2.1)
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
// PropertyFlags — @IsOptional, @IsDefined, @ValidateIf, @ValidateNested (§2.1)
// ─────────────────────────────────────────────────────────────────────────────

export interface PropertyFlags {
  /** `@IsOptional`() — skip all validation when undefined/null */
  isOptional?: boolean;
  /** `@IsDefined`() — disallow undefined (overrides @IsOptional). Current code rejects only undefined; null is delegated to subsequent validation */
  isDefined?: boolean;
  /** `@IsNullable`() — allow and assign null, reject undefined */
  isNullable?: boolean;
  /** `@ValidateIf`(cond) — skip all field validation when false */
  validateIf?: (obj: Record<string, unknown>) => boolean;
  /** `@ValidateNested`() — trigger recursive validation for nested DTOs. Used with @Type */
  validateNested?: boolean;
  /** `@ValidateNested`({ each: true }) — validate nested DTOs per array element */
  validateNestedEach?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// RawPropertyMeta — Collection data stored in Class[Symbol.metadata][RAW][propertyKey] (§2.1)
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
