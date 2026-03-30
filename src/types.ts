// ─────────────────────────────────────────────────────────────────────────────
// EmitContext — Code generation context (§4.7)
// ─────────────────────────────────────────────────────────────────────────────

export interface EmitContext {
  /** Register a RegExp in the reference array, return its index */
  addRegex(re: RegExp): number;
  /** Register in the reference array, return its index — functions, arrays, Sets, primitives, etc. */
  addRef(value: unknown): number;
  /** Register a SealedExecutors object in the reference array — for nested @Type DTOs */
  addExecutor(executor: SealedExecutors<unknown>): number;
  /** Generate a failure code string from an error code — path is bound by the builder */
  fail(code: string): string;
  /** Whether error collection mode is enabled (= !stopAtFirstError) */
  collectErrors: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// EmittableRule — Validation function + .emit() (§4.7, §4.8)
// ─────────────────────────────────────────────────────────────────────────────

export interface EmittableRule {
  (value: unknown): boolean | Promise<boolean>;
  emit(varName: string, ctx: EmitContext): string;
  readonly ruleName: string;
  /**
   * Meta for the builder to determine whether to insert a typeof guard.
   * Only set for rules that assume a specific type (e.g., isEmail → 'string').
   * @IsString itself is undefined (it includes its own typeof check).
   */
  readonly requiresType?: 'string' | 'number' | 'boolean' | 'date';
  /** Expose rule parameters for external reading */
  readonly constraints?: Record<string, unknown>;
  /** true when using an async validate function — deserialize-builder generates await code */
  readonly isAsync?: boolean;
}

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
  rule: EmittableRule;
  each?: boolean;
  groups?: string[];
  /** Value to include in BakerError.message on validation failure */
  message?: string | ((args: MessageArgs) => string);
  /** Arbitrary value to include in BakerError.context on validation failure */
  context?: unknown;
}

/** @Transform callback signature */
export type TransformFunction = (params: TransformParams) => unknown;

export interface TransformParams {
  value: unknown;
  key: string;
  /** deserialize: original input object, serialize: class instance */
  obj: Record<string, unknown>;
  type: 'deserialize' | 'serialize';
}

export interface TransformDef {
  fn: TransformFunction;
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
  fn: () => (new (...args: any[]) => any) | (new (...args: any[]) => any)[];
  discriminator?: {
    property: string;
    subTypes: { value: Function; name: string }[];
  };
  keepDiscriminatorProperty?: boolean;
  /** seal() normalization result — true if fn() returns an array */
  isArray?: boolean;
  /** seal() normalization result — cached class after resolving fn() (DTOs only, excluding primitives) */
  resolvedClass?: new (...args: any[]) => any;
  /** seal() normalization result — Map or Set collection type */
  collection?: 'Map' | 'Set';
  /** Nested DTO class thunk for Map value / Set element */
  collectionValue?: () => new (...args: any[]) => any;
  /** seal() normalization result — cached class after resolving collectionValue */
  resolvedCollectionValue?: new (...args: any[]) => any;
}

// ─────────────────────────────────────────────────────────────────────────────
// PropertyFlags — @IsOptional, @IsDefined, @ValidateIf, @ValidateNested (§2.1)
// ─────────────────────────────────────────────────────────────────────────────

export interface PropertyFlags {
  /** @IsOptional() — skip all validation when undefined/null */
  isOptional?: boolean;
  /** @IsDefined() — disallow undefined (overrides @IsOptional). Current code rejects only undefined; null is delegated to subsequent validation */
  isDefined?: boolean;
  /** @IsNullable() — allow and assign null, reject undefined */
  isNullable?: boolean;
  /** @ValidateIf(cond) — skip all field validation when false */
  validateIf?: (obj: any) => boolean;
  /** @ValidateNested() — trigger recursive validation for nested DTOs. Used with @Type */
  validateNested?: boolean;
  /** @ValidateNested({ each: true }) — validate nested DTOs per array element */
  validateNestedEach?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// RawPropertyMeta — Collection data stored in Class[RAW][propertyKey] (§2.1)
// ─────────────────────────────────────────────────────────────────────────────

export interface RawPropertyMeta {
  validation: RuleDef[];
  transform: TransformDef[];
  expose: ExposeDef[];
  exclude: ExcludeDef | null;
  type: TypeDef | null;
  flags: PropertyFlags;
}

export interface RawClassMeta {
  [propertyKey: string]: RawPropertyMeta;
}

// ─────────────────────────────────────────────────────────────────────────────
// SealedExecutors — Dual executor stored in Class[SEALED] (§2.1)
// ─────────────────────────────────────────────────────────────────────────────

import type { RuntimeOptions } from './interfaces';
import type { BakerError } from './errors';
import type { Result, ResultAsync } from '@zipbul/result';

export interface SealedExecutors<T> {
  /** Internal executor — Result pattern. deserialize() wraps and converts to throw */
  _deserialize(input: unknown, options?: RuntimeOptions): Result<T, BakerError[]> | ResultAsync<T, BakerError[]>;
  /** Internal executor — always succeeds. serialize assumes no validation */
  _serialize(instance: T, options?: RuntimeOptions): Record<string, unknown> | Promise<Record<string, unknown>>;
  /** true if the deserialize direction has async rules/transforms/nested */
  _isAsync: boolean;
  /** true if the serialize direction has async transforms/nested */
  _isSerializeAsync: boolean;
  /** Merged metadata cache — used by getMeta() */
  _merged?: RawClassMeta;
}
