import type { RawPropertyMeta, RuleDef, ExposeDef, TypeDef } from '../metadata';
import type { EmittableRule, InternalRule } from '../rules';
import type { ArrayOfMarker, FieldOptions } from './interfaces';
import type { FieldDecorator, FieldValue, RuleArg } from './types';

import { BakerError, isAsyncFunction } from '../common';
import { metaStore } from '../metadata';
import { ARRAY_OF, FIELD_OPTION_KEYS } from './constants';
import { ExcludeMode } from './enums';

// ─────────────────────────────────────────────────────────────────────────────
// arrayOf — Array element validation marker (compiles to per-rule `each: true`)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply rules to each element of an array.
 *
 * @example
 * ```ts
 * \@Field(arrayOf(isString(), minLength(1)))
 * tags!: string[];
 * ```
 */
function arrayOf<E>(...rules: EmittableRule<E>[]): ArrayOfMarker<E> {
  return { rules, [ARRAY_OF]: true };
}

function isArrayOfMarker(arg: unknown): arg is ArrayOfMarker {
  return typeof arg === 'object' && arg !== null && (arg as Record<symbol, unknown>)[ARRAY_OF] === true;
}

// ─────────────────────────────────────────────────────────────────────────────
// FieldOptions detection — distinguish from EmittableRule/ArrayOfMarker
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// FieldMetaApplier — apply a parsed @Field's rules + options onto RawPropertyMeta
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Applies a parsed @Field's rules and options onto the field's {@link RawPropertyMeta}. Holds
 * `(meta, options)` as fields so each aspect (validation, flags, type, expose, exclude, transform)
 * reads from a single source of truth instead of threading the same pair through a pile of free
 * functions — mirroring the seal-stage builders (DeserializeBuilder / SerializeBuilder).
 */
class FieldMetaApplier {
  readonly #meta: RawPropertyMeta;
  readonly #options: FieldOptions;

  constructor(meta: RawPropertyMeta, options: FieldOptions) {
    this.#meta = meta;
    this.#options = options;
  }

  apply(rules: RuleArg[]): void {
    this.#applyValidation(rules);
    this.#applyMessageContext();
    this.#applyFlags();
    this.#applyType();
    this.#applyExpose();
    this.#applyExclude();
    this.#applyTransform();
  }

  /** Register validation rules + handle arrayOf. */
  #applyValidation(rules: RuleArg[]): void {
    for (const rule of rules) {
      if (isArrayOfMarker(rule)) {
        for (const innerRule of rule.rules) {
          this.#meta.validation.push(this.#decorateRuleDef({ rule: innerRule, each: true }));
        }
      } else {
        this.#meta.validation.push(this.#decorateRuleDef({ rule: rule as InternalRule }));
      }
    }
  }

  /**
   * Field-level message/context — stored regardless of rules so non-rule failures (type gate,
   * required-missing, conversion, structural gates) and type-only fields can carry them, not just
   * rule-body failures.
   */
  #applyMessageContext(): void {
    if (this.#options.context !== undefined) {
      this.#meta.context = this.#options.context;
    }
    if (this.#options.message !== undefined) {
      this.#meta.message = this.#options.message;
    }
  }

  #applyFlags(): void {
    if (this.#options.optional) {
      this.#meta.flags.isOptional = true;
    }
    if (this.#options.nullable) {
      this.#meta.flags.isNullable = true;
    }
    if (this.#options.when) {
      this.#meta.flags.validateIf = this.#options.when;
    }
  }

  /** Nested DTO + discriminator + collection. */
  #applyType(): void {
    if (!this.#options.type) {
      return;
    }
    const td: TypeDef = { fn: this.#options.type };
    if (this.#options.discriminator !== undefined) {
      td.discriminator = this.#options.discriminator;
    }
    if (this.#options.keepDiscriminatorProperty !== undefined) {
      td.keepDiscriminatorProperty = this.#options.keepDiscriminatorProperty;
    }
    const cv = this.#options.mapValue ?? this.#options.setValue;
    if (cv !== undefined) {
      td.collectionValue = cv;
    }
    this.#meta.type = td;
  }

  /** Expose 5-branch logic. */
  #applyExpose(): void {
    const options = this.#options;
    if (options.name) {
      this.#meta.expose.push(this.#withGroups({ name: options.name }));
    } else if (options.deserializeName || options.serializeName) {
      if (options.deserializeName) {
        this.#meta.expose.push(this.#withGroups({ name: options.deserializeName, deserializeOnly: true }));
      }
      if (options.serializeName) {
        this.#meta.expose.push(this.#withGroups({ name: options.serializeName, serializeOnly: true }));
      }
    } else if (options.groups) {
      this.#meta.expose.push({ groups: options.groups });
    } else {
      this.#meta.expose.push({});
    }
  }

  #applyExclude(): void {
    const exclude = this.#options.exclude;
    if (!exclude) {
      return;
    }
    if (exclude === true) {
      this.#meta.exclude = {};
    } else if (exclude === ExcludeMode.DeserializeOnly) {
      this.#meta.exclude = { deserializeOnly: true };
    } else if (exclude === ExcludeMode.SerializeOnly) {
      this.#meta.exclude = { serializeOnly: true };
    }
  }

  /**
   * Register Transformer — split into direction-specific TransformDefs, storing each direction's raw
   * user fn (seal-time `isAsync` detection only; the sync-transform-returned-Promise guard is inlined
   * into generated code by deserialize-builder/serialize-builder, gated on `isAsync`).
   */
  #applyTransform(): void {
    const transform = this.#options.transform;
    if (!transform) {
      return;
    }
    const transformers = Array.isArray(transform) ? transform : [transform];
    for (const t of transformers) {
      this.#meta.transform.push(
        { fn: t.deserialize, isAsync: isAsyncFunction(t.deserialize), options: { deserializeOnly: true } },
        { fn: t.serialize, isAsync: isAsyncFunction(t.serialize), options: { serializeOnly: true } },
      );
    }
  }

  // Copy the field-level groups/message/context options onto a rule def (only when provided). The
  // message/context copy is REQUIRED, not redundant: the per-element ('each') emission path reads
  // `rd.message`/`rd.context` directly via computeRuleExtras and does NOT fall back to the field-level
  // meta.message/meta.context (that fallback only covers the non-each, field-own-path failures).
  #decorateRuleDef(rd: RuleDef): RuleDef {
    const options = this.#options;
    if (options.groups !== undefined) {
      rd.groups = options.groups;
    }
    if (options.message !== undefined) {
      rd.message = options.message;
    }
    if (options.context !== undefined) {
      rd.context = options.context;
    }
    return rd;
  }

  /** Copy the field-level groups option onto an expose def (only when provided). */
  #withGroups(ed: ExposeDef): ExposeDef {
    if (this.#options.groups !== undefined) {
      ed.groups = this.#options.groups;
    }
    return ed;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// @Field — Field decorator (4 overloads)
// ─────────────────────────────────────────────────────────────────────────────

/** `@Field`() — empty field registration */
function Field(): FieldDecorator;
/** `@Field`({ type: () => Dto }) — options object */
function Field(options: FieldOptions): FieldDecorator;
/**
 * `@Field`(isString, isEmail()) — validated field. `V` is the intersection of the rules' domains, so
 * a rule applied to a field of the wrong type fails to compile; an `arrayOf(...)` marker additionally
 * requires the field to be a container of the element type.
 */
function Field<V, E = never>(...rules: (EmittableRule<V> | ArrayOfMarker<E>)[]): FieldDecorator<FieldValue<V, NoInfer<E>>>;
/** `@Field`(isString, { optional: true }) — rules + options mixed */
function Field<V, E = never>(
  ...rulesAndOptions: [...(EmittableRule<V> | ArrayOfMarker<E>)[], FieldOptions]
): FieldDecorator<FieldValue<V, NoInfer<E>>>;
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
    const meta = metaStore.ensure(context.metadata, propertyKey);

    const { rules, options } = parseFieldArgs(args);

    // `name` is bidirectional; `deserializeName`/`serializeName` are per-direction. Combining them
    // is contradictory — reject it instead of silently dropping the per-direction names. Truthiness
    // matches applyExpose: an empty-string name is treated as "no name" consistently throughout.
    if (options.name && (options.deserializeName || options.serializeName)) {
      throw new BakerError(
        `@Field on ${propertyKey}: 'name' cannot be combined with 'deserializeName'/'serializeName'. Use one or the other.`,
      );
    }

    // `mapValue` (Map value type) and `setValue` (Set element type) both fill the single collection
    // value slot — providing both is ambiguous and would silently drop one. Reject it instead.
    if (options.mapValue !== undefined && options.setValue !== undefined) {
      throw new BakerError(
        `@Field on ${propertyKey}: 'mapValue' and 'setValue' cannot both be set — use 'mapValue' for a Map value type and 'setValue' for a Set element type.`,
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

    new FieldMetaApplier(meta, options).apply(rules);
  };
}
export { arrayOf, Field };
export type { ArrayOfMarker, FieldOptions };
