import { ensureMeta } from '../collect';
import { isAsyncFunction } from '../utils';
import type { EmittableRule, RawPropertyMeta, RuleDef, TypeDef } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// arrayOf — Array element validation marker (replaces each: true)
// ─────────────────────────────────────────────────────────────────────────────

const ARRAY_OF = Symbol.for('baker:arrayOf');

export interface ArrayOfMarker {
  readonly [key: symbol]: true;
  readonly rules: EmittableRule[];
}

/**
 * Apply rules to each element of an array.
 *
 * @example
 * @Field(arrayOf(isString(), minLength(1)))
 * tags!: string[];
 */
export function arrayOf(...rules: EmittableRule[]): ArrayOfMarker {
  const marker = { rules } as any;
  marker[ARRAY_OF] = true;
  return marker as ArrayOfMarker;
}

function isArrayOfMarker(arg: unknown): arg is ArrayOfMarker {
  return typeof arg === 'object' && arg !== null && (arg as any)[ARRAY_OF] === true;
}

// ─────────────────────────────────────────────────────────────────────────────
// FieldOptions — @Field options object
// ─────────────────────────────────────────────────────────────────────────────

export interface FieldTransformParams {
  value: unknown;
  key: string;
  obj: Record<string, unknown>;
  direction: 'deserialize' | 'serialize';
}

export interface FieldOptions {
  /** Nested DTO type. Thunk — supports circular references. [Dto] for arrays. */
  type?: () => (new (...args: any[]) => any) | (new (...args: any[]) => any)[];
  /** Polymorphic discriminator configuration — used with type */
  discriminator?: {
    property: string;
    subTypes: { value: Function; name: string }[];
  };
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
  exclude?: boolean | 'deserializeOnly' | 'serializeOnly';
  /** Groups — field visibility control + conditional validation rule application */
  groups?: string[];
  /** Conditional validation — skip all field validation when false */
  when?: (obj: any) => boolean;
  /** Value transform function */
  transform?: (params: FieldTransformParams) => unknown;
  /** Transform direction restriction */
  transformDirection?: 'deserializeOnly' | 'serializeOnly';
  /** Error message on validation failure — applied to all rules of the field (rule's own message takes precedence) */
  message?: string | ((args: { property: string; value: unknown; constraints: Record<string, unknown> }) => string);
  /** Error context on validation failure — applied to all rules of the field (rule's own context takes precedence) */
  context?: unknown;
  /** Nested DTO class thunk for Map values — used with type: () => Map */
  mapValue?: () => new (...args: any[]) => any;
  /** Nested DTO class thunk for Set elements — used with type: () => Set */
  setValue?: () => new (...args: any[]) => any;
}

// ─────────────────────────────────────────────────────────────────────────────
// FieldOptions detection — distinguish from EmittableRule/ArrayOfMarker
// ─────────────────────────────────────────────────────────────────────────────

const FIELD_OPTION_KEYS = new Set([
  'type', 'discriminator', 'keepDiscriminatorProperty', 'rules',
  'optional', 'nullable', 'name', 'deserializeName', 'serializeName',
  'exclude', 'groups', 'when', 'transform', 'transformDirection',
  'message', 'context', 'mapValue', 'setValue',
]);

function isFieldOptions(arg: unknown): arg is FieldOptions {
  if (typeof arg === 'function') return false;
  if (typeof arg !== 'object' || arg === null) return false;
  if (isArrayOfMarker(arg)) return false;
  // Treat as FieldOptions if at least one known key exists
  const keys = Object.keys(arg);
  if (keys.length === 0) return true; // @Field({})
  return keys.some(k => FIELD_OPTION_KEYS.has(k));
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers — Field() decorator decomposition
// ─────────────────────────────────────────────────────────────────────────────

type RuleArg = EmittableRule | ArrayOfMarker;

/** Normalize 4 overload signatures into `{ rules, options }` */
function parseFieldArgs(args: any[]): { rules: RuleArg[]; options: FieldOptions } {
  if (args.length === 0) {
    // Form 1: @Field()
    return { rules: [], options: {} };
  }
  if (args.length === 1 && isFieldOptions(args[0])) {
    // Form 3: @Field({ type: () => Dto })
    const options = args[0] as FieldOptions;
    return { rules: options.rules ?? [], options };
  }
  // Form 2 or 4
  const lastArg = args[args.length - 1];
  if (isFieldOptions(lastArg)) {
    // Form 4: @Field(isString(), { optional: true })
    const options = lastArg as FieldOptions;
    let rules: RuleArg[] = args.slice(0, -1);
    if (options.rules) rules = [...rules, ...options.rules];
    return { rules, options };
  }
  // Form 2: @Field(isString(), email())
  return { rules: args, options: {} };
}

/** Register validation rules + handle arrayOf */
function applyValidation(meta: RawPropertyMeta, rules: RuleArg[], options: FieldOptions): void {
  for (const rule of rules) {
    if (isArrayOfMarker(rule)) {
      for (const innerRule of rule.rules) {
        const rd: RuleDef = { rule: innerRule, each: true, groups: options.groups };
        if (options.message !== undefined) rd.message = options.message;
        if (options.context !== undefined) rd.context = options.context;
        meta.validation.push(rd);
      }
    } else {
      const rd: RuleDef = { rule: rule as EmittableRule, groups: options.groups };
      if (options.message !== undefined) rd.message = options.message;
      if (options.context !== undefined) rd.context = options.context;
      meta.validation.push(rd);
    }
  }
}

/** Handle expose 5-branch logic */
function applyExpose(meta: RawPropertyMeta, options: FieldOptions): void {
  if (options.name) {
    meta.expose.push({ name: options.name, groups: options.groups });
  } else if (options.deserializeName || options.serializeName) {
    if (options.deserializeName) {
      meta.expose.push({ name: options.deserializeName, deserializeOnly: true, groups: options.groups });
    }
    if (options.serializeName) {
      meta.expose.push({ name: options.serializeName, serializeOnly: true, groups: options.groups });
    }
  } else if (options.groups) {
    meta.expose.push({ groups: options.groups });
  } else {
    meta.expose.push({});
  }
}

/** Detect async + wrap direction + register transform */
function applyTransform(meta: RawPropertyMeta, options: FieldOptions): void {
  if (!options.transform) return;
  const userFn = options.transform;
  const isAsync = isAsyncFunction(userFn);
  const wrapperFn = isAsync
    ? async (params: any) => userFn({
        value: params.value,
        key: params.key,
        obj: params.obj,
        direction: params.type,
      })
    : (params: any) => userFn({
        value: params.value,
        key: params.key,
        obj: params.obj,
        direction: params.type,
      });
  const transformOptions: any = {};
  if (options.transformDirection === 'deserializeOnly') transformOptions.deserializeOnly = true;
  if (options.transformDirection === 'serializeOnly') transformOptions.serializeOnly = true;
  meta.transform.push({
    fn: wrapperFn,
    options: Object.keys(transformOptions).length > 0 ? transformOptions : undefined,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// @Field — Field decorator (4 overloads)
// ─────────────────────────────────────────────────────────────────────────────

/** @Field() — empty field registration */
export function Field(): PropertyDecorator;
/** @Field(isString(), email()) — variadic rules */
export function Field(...rules: RuleArg[]): PropertyDecorator;
/** @Field({ type: () => Dto }) — options object */
export function Field(options: FieldOptions): PropertyDecorator;
/** @Field(isString(), { optional: true }) — rules + options mixed */
export function Field(...rulesAndOptions: [...RuleArg[], FieldOptions]): PropertyDecorator;
export function Field(...args: any[]): PropertyDecorator {
  return (target, key) => {
    const ctor = (target as any).constructor;
    const propertyKey = key as string;
    const meta = ensureMeta(ctor, propertyKey);

    const { rules, options } = parseFieldArgs(args);

    applyValidation(meta, rules, options);

    // ── flags ──
    if (options.optional) meta.flags.isOptional = true;
    if (options.nullable) meta.flags.isNullable = true;
    if (options.when) meta.flags.validateIf = options.when;

    // ── type (nested DTO + discriminator + collection) ──
    if (options.type) {
      meta.type = {
        fn: options.type as TypeDef['fn'],
        discriminator: options.discriminator,
        keepDiscriminatorProperty: options.keepDiscriminatorProperty,
        collectionValue: options.mapValue ?? options.setValue,
      };
    }

    applyExpose(meta, options);

    // ── exclude ──
    if (options.exclude) {
      if (options.exclude === true) {
        meta.exclude = {};
      } else if (options.exclude === 'deserializeOnly') {
        meta.exclude = { deserializeOnly: true };
      } else if (options.exclude === 'serializeOnly') {
        meta.exclude = { serializeOnly: true };
      }
    }

    applyTransform(meta, options);
  };
}
