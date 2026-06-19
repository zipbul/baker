import type { ClassCtor } from '../common/types';
import type { EmittableRule, InternalRule } from '../rules/types';
import type { RawPropertyMeta, RuleDef, ExposeDef, TypeDef } from '../metadata/types';
import type { Transformer } from '../transformers/types';

import { ensureMeta } from '../metadata/collect';
import { Direction } from '../common/enums';
import { ExcludeMode } from './enums';
import { BakerError } from '../common/errors';
import { isAsyncFunction, isPromiseLike } from '../common/utils';

// ─────────────────────────────────────────────────────────────────────────────
// arrayOf — Array element validation marker (replaces each: true)
// ─────────────────────────────────────────────────────────────────────────────

const ARRAY_OF = Symbol.for('baker:arrayOf');

interface ArrayOfMarker {
  readonly [key: symbol]: true;
  readonly rules: EmittableRule[];
}

/**
 * Apply rules to each element of an array.
 *
 * @example
 * ```ts
 * \@Field(arrayOf(isString(), minLength(1)))
 * tags!: string[];
 * ```
 */
function arrayOf(...rules: EmittableRule[]): ArrayOfMarker {
  const marker: { rules: EmittableRule[]; [key: symbol]: true } = { rules, [ARRAY_OF]: true };
  return marker as ArrayOfMarker;
}

function isArrayOfMarker(arg: unknown): arg is ArrayOfMarker {
  return typeof arg === 'object' && arg !== null && (arg as Record<symbol, unknown>)[ARRAY_OF] === true;
}

// ─────────────────────────────────────────────────────────────────────────────
// FieldOptions — @Field options object
// ─────────────────────────────────────────────────────────────────────────────

interface FieldOptions {
  /** Nested DTO type. Thunk — supports circular references. [Dto] for arrays. */
  type?: () => ClassCtor | ClassCtor[] | MapConstructor | SetConstructor;
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

// ─────────────────────────────────────────────────────────────────────────────
// FieldOptions detection — distinguish from EmittableRule/ArrayOfMarker
// ─────────────────────────────────────────────────────────────────────────────

const FIELD_OPTION_KEYS = new Set([
  'type',
  'discriminator',
  'keepDiscriminatorProperty',
  'rules',
  'optional',
  'nullable',
  'name',
  'deserializeName',
  'serializeName',
  'exclude',
  'groups',
  'when',
  'transform',
  'message',
  'context',
  'mapValue',
  'setValue',
]);

function isFieldOptions(arg: unknown): arg is FieldOptions {
  if (typeof arg === 'function') {
    return false;
  }
  if (typeof arg !== 'object' || arg === null) {
    return false;
  }
  if (isArrayOfMarker(arg)) {
    return false;
  }
  // Treat as FieldOptions if at least one known key exists
  const keys = Object.keys(arg);
  if (keys.length === 0) {
    return true;
  } // @Field({})
  return keys.some(k => FIELD_OPTION_KEYS.has(k));
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers — Field() decorator decomposition
// ─────────────────────────────────────────────────────────────────────────────

type RuleArg = EmittableRule | ArrayOfMarker;

/** W5: assert that a value is a valid baker rule (has `.emit` fn + `.ruleName` string). */
function assertRule(value: unknown, fieldKey: string, slot?: string): void {
  const loc = slot ? `${fieldKey} ${slot}` : fieldKey;
  const validForms = ` Valid @Field forms: @Field(), @Field(rule, ...), @Field(options), @Field(rule, ..., options).`;
  if (typeof value === 'function') {
    const fn = value as { emit?: unknown; ruleName?: unknown; name?: string };
    if (typeof fn.emit !== 'function' || typeof fn.ruleName !== 'string') {
      const hint = fn.name
        ? ` Did you forget to call '${fn.name}()'? Factories must be invoked (e.g., '${fn.name}()'). Rule constants are passed directly (e.g., 'isString' without parentheses).`
        : ` Use createRule() or import a rule from @zipbul/baker/rules.`;
      throw new BakerError(`@Field on ${loc}: argument is not a baker rule.${hint}${validForms}`);
    }
    return;
  }
  throw new BakerError(
    `@Field on ${loc}: expected a baker rule (function with .emit and .ruleName), got ${value === null ? 'null' : typeof value}. Use createRule() or import a rule from @zipbul/baker/rules.${validForms}`,
  );
}

/** Normalize 4 overload signatures into `{ rules, options }` */
function parseFieldArgs(args: unknown[]): { rules: RuleArg[]; options: FieldOptions } {
  if (args.length === 0) {
    // Form 1: @Field()
    return { rules: [], options: {} };
  }
  if (args.length === 1 && isFieldOptions(args[0])) {
    // Form 3: @Field({ type: () => Dto })
    const options = args[0];
    return { rules: options.rules ?? [], options };
  }
  // Form 2 or 4
  const lastArg = args[args.length - 1];
  if (isFieldOptions(lastArg)) {
    // Form 4: @Field(isString(), { optional: true })
    const options = lastArg;
    let rules = args.slice(0, -1) as RuleArg[];
    if (options.rules) {
      rules = [...rules, ...options.rules];
    }
    return { rules, options };
  }
  // Form 2: @Field(isString(), email())
  return { rules: args as RuleArg[], options: {} };
}

/** Register validation rules + handle arrayOf */
function applyValidation(meta: RawPropertyMeta, rules: RuleArg[], options: FieldOptions): void {
  for (const rule of rules) {
    if (isArrayOfMarker(rule)) {
      for (const innerRule of rule.rules) {
        const rd: RuleDef = { rule: innerRule, each: true };
        if (options.groups !== undefined) {
          rd.groups = options.groups;
        }
        if (options.message !== undefined) {
          rd.message = options.message;
        }
        if (options.context !== undefined) {
          rd.context = options.context;
        }
        meta.validation.push(rd);
      }
    } else {
      const rd: RuleDef = { rule: rule as InternalRule };
      if (options.groups !== undefined) {
        rd.groups = options.groups;
      }
      if (options.message !== undefined) {
        rd.message = options.message;
      }
      if (options.context !== undefined) {
        rd.context = options.context;
      }
      meta.validation.push(rd);
    }
  }
}

/** Handle expose 5-branch logic */
function applyExpose(meta: RawPropertyMeta, options: FieldOptions): void {
  if (options.name) {
    const ed: ExposeDef = { name: options.name };
    if (options.groups !== undefined) {
      ed.groups = options.groups;
    }
    meta.expose.push(ed);
  } else if (options.deserializeName || options.serializeName) {
    if (options.deserializeName) {
      const ed: ExposeDef = { name: options.deserializeName, deserializeOnly: true };
      if (options.groups !== undefined) {
        ed.groups = options.groups;
      }
      meta.expose.push(ed);
    }
    if (options.serializeName) {
      const ed: ExposeDef = { name: options.serializeName, serializeOnly: true };
      if (options.groups !== undefined) {
        ed.groups = options.groups;
      }
      meta.expose.push(ed);
    }
  } else if (options.groups) {
    meta.expose.push({ groups: options.groups });
  } else {
    meta.expose.push({});
  }
}

/** Register Transformer — split into direction-specific TransformDefs */
function wrapTransform(
  propertyKey: string,
  direction: Direction,
  fn: Transformer['deserialize'] | Transformer['serialize'],
): { fn: typeof fn; isAsync: boolean } {
  const isAsync = isAsyncFunction(fn);
  const wrapped = (params => {
    const result = fn(params);
    if (!isAsync && isPromiseLike(result)) {
      throw new BakerError(
        `@Field(${propertyKey}) ${direction} transform returned Promise. Declare the transform with async if it is asynchronous.`,
      );
    }
    return result;
  }) as typeof fn;
  return { fn: wrapped, isAsync };
}

/** Register Transformer — split into direction-specific TransformDefs */
function applyTransform(meta: RawPropertyMeta, propertyKey: string, options: FieldOptions): void {
  if (!options.transform) {
    return;
  }
  const transformers = Array.isArray(options.transform) ? options.transform : [options.transform];
  for (const t of transformers) {
    const deserialize = wrapTransform(propertyKey, Direction.Deserialize, t.deserialize);
    const serialize = wrapTransform(propertyKey, Direction.Serialize, t.serialize);
    meta.transform.push(
      { fn: deserialize.fn, isAsync: deserialize.isAsync, options: { deserializeOnly: true } },
      { fn: serialize.fn, isAsync: serialize.isAsync, options: { serializeOnly: true } },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// @Field — Field decorator (4 overloads)
// ─────────────────────────────────────────────────────────────────────────────

type FieldDecorator = (value: undefined, context: ClassFieldDecoratorContext) => void;

/** `@Field`() — empty field registration */
function Field(): FieldDecorator;
/** `@Field`(isString(), email()) — variadic rules */
function Field(...rules: RuleArg[]): FieldDecorator;
/** `@Field`({ type: () => Dto }) — options object */
function Field(options: FieldOptions): FieldDecorator;
/** `@Field`(isString(), { optional: true }) — rules + options mixed */
function Field(...rulesAndOptions: [...RuleArg[], FieldOptions]): FieldDecorator;
function Field(...args: unknown[]): FieldDecorator {
  return (_value, context) => {
    if (context.static) {
      throw new BakerError(`@Field cannot decorate static fields.`);
    }
    if (context.private) {
      throw new BakerError(`@Field cannot decorate private fields.`);
    }
    if (typeof context.name === 'symbol') {
      throw new BakerError(`@Field: symbol property keys are not supported. Use a string property name.`);
    }
    const propertyKey = context.name;
    const meta = ensureMeta(context.metadata, propertyKey);

    const { rules, options } = parseFieldArgs(args);

    // `name` is bidirectional; `deserializeName`/`serializeName` are per-direction. Combining them
    // is contradictory — reject it instead of silently dropping the per-direction names. Truthiness
    // matches applyExpose: an empty-string name is treated as "no name" consistently throughout.
    if (options.name && (options.deserializeName || options.serializeName)) {
      throw new BakerError(
        `@Field on ${propertyKey}: 'name' cannot be combined with 'deserializeName'/'serializeName'. Use one or the other.`,
      );
    }

    // W5: validate each rule shape — `.emit` function + `.ruleName` string required.
    // Catches D2/D4: `@Field(isString())` (boolean), `@Field(isNumber)` (factory unstamped), `@Field(() => true)`.
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i];
      if (isArrayOfMarker(r)) {
        for (let j = 0; j < r.rules.length; j++) {
          assertRule(r.rules[j], propertyKey, `arrayOf[${j}]`);
        }
      } else {
        assertRule(r, propertyKey);
      }
    }

    applyValidation(meta, rules, options);

    // Field-level message/context — stored regardless of rules so non-rule failures
    // (type gate, required-missing, conversion, structural gates) and type-only fields
    // can carry them, not just rule-body failures.
    if (options.context !== undefined) {
      meta.context = options.context;
    }
    if (options.message !== undefined) {
      meta.message = options.message;
    }

    // ── flags ──
    if (options.optional) {
      meta.flags.isOptional = true;
    }
    if (options.nullable) {
      meta.flags.isNullable = true;
    }
    if (options.when) {
      meta.flags.validateIf = options.when;
    }

    // ── type (nested DTO + discriminator + collection) ──
    if (options.type) {
      const td: TypeDef = { fn: options.type as TypeDef['fn'] };
      if (options.discriminator !== undefined) {
        td.discriminator = options.discriminator;
      }
      if (options.keepDiscriminatorProperty !== undefined) {
        td.keepDiscriminatorProperty = options.keepDiscriminatorProperty;
      }
      const cv = options.mapValue ?? options.setValue;
      if (cv !== undefined) {
        td.collectionValue = cv;
      }
      meta.type = td;
    }

    applyExpose(meta, options);

    // ── exclude ──
    if (options.exclude) {
      if (options.exclude === true) {
        meta.exclude = {};
      } else if (options.exclude === ExcludeMode.DeserializeOnly) {
        meta.exclude = { deserializeOnly: true };
      } else if (options.exclude === ExcludeMode.SerializeOnly) {
        meta.exclude = { serializeOnly: true };
      }
    }

    applyTransform(meta, propertyKey, options);
  };
}
export { arrayOf, Field };
export type { ArrayOfMarker, FieldOptions };
