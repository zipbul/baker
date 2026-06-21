import type { RawPropertyMeta, RuleDef, ExposeDef, TypeDef } from '../metadata';
import type { EmittableRule, InternalRule } from '../rules';
import type { Transformer } from '../transformers';
import type { ArrayOfMarker, FieldOptions } from './interfaces';
import type { FieldDecorator, RuleArg } from './types';

import { Direction, BakerError, isAsyncFunction, isPromiseLike } from '../common';
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
function arrayOf(...rules: EmittableRule[]): ArrayOfMarker {
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

// Copy the field-level groups/message/context options onto a rule def (only when provided). The
// message/context copy is REQUIRED, not redundant: the per-element ('each') emission path reads
// `rd.message`/`rd.context` directly via computeRuleExtras and does NOT fall back to the field-level
// meta.message/meta.context (that fallback only covers the non-each, field-own-path failures).
function decorateRuleDef(rd: RuleDef, options: FieldOptions): RuleDef {
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
function withGroups(ed: ExposeDef, options: FieldOptions): ExposeDef {
  if (options.groups !== undefined) {
    ed.groups = options.groups;
  }
  return ed;
}

/** Register validation rules + handle arrayOf */
function applyValidation(meta: RawPropertyMeta, rules: RuleArg[], options: FieldOptions): void {
  for (const rule of rules) {
    if (isArrayOfMarker(rule)) {
      for (const innerRule of rule.rules) {
        meta.validation.push(decorateRuleDef({ rule: innerRule, each: true }, options));
      }
    } else {
      meta.validation.push(decorateRuleDef({ rule: rule as InternalRule }, options));
    }
  }
}

/** Handle expose 5-branch logic */
function applyExpose(meta: RawPropertyMeta, options: FieldOptions): void {
  if (options.name) {
    meta.expose.push(withGroups({ name: options.name }, options));
  } else if (options.deserializeName || options.serializeName) {
    if (options.deserializeName) {
      meta.expose.push(withGroups({ name: options.deserializeName, deserializeOnly: true }, options));
    }
    if (options.serializeName) {
      meta.expose.push(withGroups({ name: options.serializeName, serializeOnly: true }, options));
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
