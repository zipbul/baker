import { RAW_CLASS_SCHEMA, SEALED } from '../symbols';
import { mergeInheritance } from '../seal/seal';
import type { RawClassMeta, RawPropertyMeta, RuleDef, JsonSchema202012, SealedExecutors } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// ToJsonSchemaOptions (§6.4)
// ─────────────────────────────────────────────────────────────────────────────

export interface ToJsonSchemaOptions {
  direction?: 'deserialize' | 'serialize';
  groups?: string[];
  /** true: adds unevaluatedProperties: false to all object schemas (corresponds to seal's whitelist option) */
  whitelist?: boolean;
  /** Class-level JSON Schema metadata (title, description, etc.) */
  title?: string;
  description?: string;
  $id?: string;
  /** Callback for unmapped rules (default: console.warn) */
  onUnmappedRule?: (ruleName: string, fieldKey: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal context — created per toJsonSchema invocation
// ─────────────────────────────────────────────────────────────────────────────

interface SchemaContext {
  direction: 'deserialize' | 'serialize';
  groups?: string[];
  whitelist?: boolean;
  /** Classes currently on the recursion stack (circular reference detection) */
  processing: Set<Function>;
  /** Class to $defs key mapping */
  defKeyMap: Map<Function, string>;
  /** Accumulated $defs */
  defs: Record<string, JsonSchema202012>;
  /** Counter for disambiguating same-named classes */
  nameCounter: Map<string, number>;
  /** Unmapped rule callback */
  onUnmappedRule?: (ruleName: string, fieldKey: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// composition-aware merge keywords (§6.5)
// ─────────────────────────────────────────────────────────────────────────────

/** Module-level: emit console.warn only once per ruleName */
const _warnedRules = new Set<string>();

const COMPOSITION_KEYWORDS = new Set([
  'allOf', 'anyOf', 'oneOf', 'not', 'if', 'then', 'else',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Mapping table: ruleName → JSON Schema keywords (§6.3)
// ─────────────────────────────────────────────────────────────────────────────

const RULE_SCHEMA_MAP: Record<string, (c: Record<string, unknown>) => JsonSchema202012 | null> = {
  // Types
  isString:  () => ({ type: 'string' }),
  isNumber:  () => ({ type: 'number' }),
  isInt:     () => ({ type: 'integer' }),
  isBoolean: () => ({ type: 'boolean' }),
  isDate:    () => ({ type: 'string', format: 'date-time' }),
  isArray:   () => ({ type: 'array' }),
  isObject:  () => ({ type: 'object' }),

  // enum / const
  isEnum:   (c) => ({ enum: c.values as unknown[] }),
  isIn:     (c) => ({ enum: c.values as unknown[] }),
  equals:   (c) => ({ const: c.value }),
  notEquals: (c) => ({ not: { const: c.value } }),
  isNotIn:  (c) => ({ not: { enum: c.values as unknown[] } }),

  // Numbers
  min: (c) => c.exclusive
    ? { exclusiveMinimum: c.min as number }
    : { minimum: c.min as number },
  max: (c) => c.exclusive
    ? { exclusiveMaximum: c.max as number }
    : { maximum: c.max as number },
  isPositive:    () => ({ exclusiveMinimum: 0 }),
  isNegative:    () => ({ exclusiveMaximum: 0 }),
  isDivisibleBy: (c) => ({ multipleOf: c.divisor as number }),

  // Strings
  minLength: (c) => ({ minLength: c.min as number }),
  maxLength: (c) => ({ maxLength: c.max as number }),
  length:    (c) => ({ minLength: c.min as number, maxLength: c.max as number }),
  matches:   (c) => ({ pattern: c.pattern as string }),

  // Format family
  isEmail:   () => ({ format: 'email' }),
  isURL:     () => ({ format: 'uri' }),
  isUUID:    () => ({ format: 'uuid' }),
  isISO8601: () => ({ format: 'date-time' }),
  isIP: (c) => {
    if (c.version === 4) return { format: 'ipv4' };
    if (c.version === 6) return { format: 'ipv6' };
    return null; // Version not specified — no schema mapping
  },

  // Arrays
  arrayMinSize:  (c) => ({ minItems: c.min as number }),
  arrayMaxSize:  (c) => ({ maxItems: c.max as number }),
  arrayUnique:   () => ({ uniqueItems: true }),
  arrayNotEmpty: () => ({ minItems: 1 }),
  arrayContains: (c) => ({ contains: { enum: c.values as unknown[] } }),

  // Objects
  isNotEmptyObject: () => ({ minProperties: 1 }),
};

// ─────────────────────────────────────────────────────────────────────────────
// toJsonSchema() — entry point (§6.1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts a registered DTO class to JSON Schema Draft 2020-12 format.
 * - Root class is inlined, nested classes are placed in $defs
 * - Circular references are safely handled via $ref
 * - Can be called before seal() (uses RAW metadata directly)
 */
export function toJsonSchema(Class: Function, options?: ToJsonSchemaOptions): JsonSchema202012 {
  const ctx: SchemaContext = {
    direction: options?.direction ?? 'deserialize',
    groups: options?.groups,
    whitelist: options?.whitelist,
    processing: new Set(),
    defKeyMap: new Map(),
    defs: {},
    nameCounter: new Map(),
    onUnmappedRule: options?.onUnmappedRule,
  };

  // Build root class inline (direct call, not processNestedClass)
  ctx.processing.add(Class);
  const bodySchema = buildClassSchema(Class, ctx);
  ctx.processing.delete(Class);

  // If root was $ref'd due to circular reference — also register in $defs
  if (ctx.defKeyMap.has(Class)) {
    ctx.defs[ctx.defKeyMap.get(Class)!] = bodySchema;
  }

  // Assemble final root schema
  const rootSchema: JsonSchema202012 = { ...bodySchema };
  rootSchema.$schema = 'https://json-schema.org/draft/2020-12/schema';

  if (Object.keys(ctx.defs).length > 0) {
    rootSchema.$defs = ctx.defs;
  }

  // Merge class-level @Schema (per-key deep merge)
  const classSchema = (Class as any)[RAW_CLASS_SCHEMA] as Record<string, unknown> | undefined;
  if (classSchema) {
    for (const [key, val] of Object.entries(classSchema)) {
      if (key === 'properties' || key === '$defs') {
        (rootSchema as any)[key] = { ...((rootSchema as any)[key] as object ?? {}), ...(val as object) };
      } else if (key === 'required') {
        rootSchema.required = [...new Set([...(rootSchema.required ?? []), ...(val as string[])])];
      } else {
        (rootSchema as any)[key] = val;
      }
    }
  }

  // Class-level metadata passed via toJsonSchema call
  if (options?.title) rootSchema.title = options.title;
  if (options?.description) rootSchema.description = options.description;
  if (options?.$id) rootSchema.$id = options.$id;

  return rootSchema;
}

// ─────────────────────────────────────────────────────────────────────────────
// getDefKey — same-named class disambiguation (§6.2)
// ─────────────────────────────────────────────────────────────────────────────

function getDefKey(C: Function, ctx: SchemaContext): string {
  const existing = ctx.defKeyMap.get(C);
  if (existing !== undefined) return existing;

  const name = C.name || 'Anonymous';
  const count = ctx.nameCounter.get(name) ?? 0;
  ctx.nameCounter.set(name, count + 1);
  const key = count === 0 ? name : `${name}_${count + 1}`;
  ctx.defKeyMap.set(C, key);
  return key;
}

// ─────────────────────────────────────────────────────────────────────────────
// processNestedClass — nested DTO → $ref (§6.2)
// ─────────────────────────────────────────────────────────────────────────────

function processNestedClass(C: Function, ctx: SchemaContext): JsonSchema202012 {
  // Already processed — $ref
  const existingKey = ctx.defKeyMap.get(C);
  if (existingKey !== undefined && existingKey in ctx.defs) {
    return { $ref: `#/$defs/${existingKey}` };
  }

  // Circular detection: if on current stack, emit $ref (schema will be filled later)
  if (ctx.processing.has(C)) {
    const defKey = getDefKey(C, ctx);
    return { $ref: `#/$defs/${defKey}` };
  }

  // Process new class
  const defKey = getDefKey(C, ctx);
  ctx.processing.add(C);
  const schema = buildClassSchema(C, ctx);
  ctx.processing.delete(C);
  ctx.defs[defKey] = schema;

  return { $ref: `#/$defs/${defKey}` };
}

// ─────────────────────────────────────────────────────────────────────────────
// buildClassSchema — class → { type: "object", properties, required } (§6.1)
// ─────────────────────────────────────────────────────────────────────────────

function buildClassSchema(C: Function, ctx: SchemaContext): JsonSchema202012 {
  const sealed = (C as any)[SEALED] as SealedExecutors<unknown> | undefined;
  const merged: RawClassMeta = sealed?._merged ?? mergeInheritance(C);
  const properties: Record<string, JsonSchema202012> = {};
  const required: string[] = [];

  for (const [fieldKey, meta] of Object.entries(merged)) {
    // @Exclude direction filtering + @Expose name resolution (§6.9)
    const schemaKey = getSchemaKey(meta, fieldKey, ctx.direction);
    if (schemaKey === null) continue;

    // @Expose groups filtering (§6.4)
    if (ctx.groups) {
      const dirExposes = meta.expose.filter(e => {
        if (ctx.direction === 'deserialize' && e.serializeOnly) return false;
        if (ctx.direction === 'serialize' && e.deserializeOnly) return false;
        return true;
      });
      if (dirExposes.length > 0) {
        const anyMatch = dirExposes.some(e => {
          if (!e.groups || e.groups.length === 0) return true;
          return e.groups.some(g => ctx.groups!.includes(g));
        });
        if (!anyMatch) continue;
      } else if (meta.validation.length > 0 && meta.validation.every(rd => rd.groups && rd.groups.length > 0)) {
        // All rules specify groups — apply field-level groups filter
        const anyRuleMatch = meta.validation.some(rd =>
          rd.groups!.some(g => ctx.groups!.includes(g)),
        );
        if (!anyRuleMatch) continue;
      }
    }

    // Build property schema
    const propSchema = buildPropertySchema(meta, ctx, fieldKey);
    properties[schemaKey] = propSchema;

    // Determine required: required unless @IsOptional
    if (!meta.flags.isOptional) {
      required.push(schemaKey);
    }
  }

  const schema: JsonSchema202012 = { type: 'object', properties };
  if (required.length > 0) schema.required = required;
  if (ctx.whitelist) schema.unevaluatedProperties = false;

  return schema;
}

// ─────────────────────────────────────────────────────────────────────────────
// getSchemaKey — direction-aware key resolution for @Exclude/@Expose (§6.9)
// ─────────────────────────────────────────────────────────────────────────────

function getSchemaKey(
  meta: RawPropertyMeta, fieldKey: string, direction: string,
): string | null {
  // @Exclude filtering
  if (meta.exclude) {
    if (!meta.exclude.deserializeOnly && !meta.exclude.serializeOnly) return null;
    if (direction === 'deserialize' && !meta.exclude.serializeOnly) return null;
    if (direction === 'serialize' && !meta.exclude.deserializeOnly) return null;
  }

  // @Expose name (direction matching — use first match)
  const expose = meta.expose.find(e => {
    if (direction === 'deserialize' && e.serializeOnly) return false;
    if (direction === 'serialize' && e.deserializeOnly) return false;
    return true;
  });
  return expose?.name ?? fieldKey;
}

// ─────────────────────────────────────────────────────────────────────────────
// buildPropertySchema — property meta → JSON Schema (§6.3, §6.10, §6.11)
// ─────────────────────────────────────────────────────────────────────────────

function buildPropertySchema(meta: RawPropertyMeta, ctx: SchemaContext, fieldKey?: string): JsonSchema202012 {
  // Collection (Map/Set) → special schema
  if (meta.type?.collection) {
    return buildCollectionSchema(meta, ctx, fieldKey);
  }

  // @Type/@Nested → $ref or discriminator
  if (meta.type) {
    return buildNestedTypeSchema(meta, ctx, fieldKey);
  }

  // Separate each / non-each rules (§6.10)
  const nonEachRules = filterByGroups(
    meta.validation.filter(rd => !rd.each), ctx.groups,
  );
  const eachRules = filterByGroups(
    meta.validation.filter(rd => rd.each), ctx.groups,
  );

  // Auto-mapping
  const autoSchema = mapRulesToSchema(nonEachRules, ctx, fieldKey);

  // each:true → items sub-schema
  if (eachRules.length > 0) {
    const itemSchema = mapRulesToSchema(eachRules, ctx, fieldKey);
    if (Object.keys(itemSchema).length > 0) {
      autoSchema.items = itemSchema;
    }
  }

  // @IsNullable → type array (§6.11)
  if (meta.flags.isNullable) {
    applyNullable(autoSchema);
  }

  // @Schema merge (§6.5, §6.6)
  return applyUserSchema(meta, autoSchema);
}

// ─────────────────────────────────────────────────────────────────────────────
// buildCollectionSchema — Map/Set → JSON Schema

function buildCollectionSchema(meta: RawPropertyMeta, ctx: SchemaContext, fieldKey?: string): JsonSchema202012 {
  const collection = meta.type!.collection!;
  let schema: JsonSchema202012;

  if (collection === 'Set') {
    // Set<T> → { type: 'array', items: ..., uniqueItems: true }
    let items: JsonSchema202012 | undefined;
    if (meta.type!.resolvedCollectionValue) {
      items = processNestedClass(meta.type!.resolvedCollectionValue, ctx);
    }
    schema = { type: 'array', uniqueItems: true };
    if (items) schema.items = items;
  } else {
    // Map<string, T> → { type: 'object', additionalProperties: ... }
    let valueSchema: JsonSchema202012 | undefined;
    if (meta.type!.resolvedCollectionValue) {
      valueSchema = processNestedClass(meta.type!.resolvedCollectionValue, ctx);
    }
    schema = { type: 'object' };
    if (valueSchema) schema.additionalProperties = valueSchema;
  }

  if (meta.flags.isNullable) applyNullable(schema);
  return applyUserSchema(meta, schema);
}

// buildNestedTypeSchema — @Type/@Nested → $ref / discriminator (§6.3)
// ─────────────────────────────────────────────────────────────────────────────

function buildNestedTypeSchema(
  meta: RawPropertyMeta, ctx: SchemaContext, fieldKey?: string,
): JsonSchema202012 {
  let innerSchema: JsonSchema202012;

  if (meta.type!.discriminator) {
    // discriminator → oneOf + const pattern
    const { property, subTypes } = meta.type!.discriminator;
    const oneOf: JsonSchema202012[] = subTypes.map(sub => {
      const ref = processNestedClass(sub.value as Function, ctx);
      return {
        allOf: [
          ref,
          { properties: { [property]: { const: sub.name } }, required: [property] },
        ],
      };
    });
    innerSchema = { oneOf };
  } else {
    // Simple nested reference
    const nestedClass = meta.type!.resolvedClass ?? meta.type!.fn() as Function;
    innerSchema = processNestedClass(nestedClass, ctx);
  }

  // each:true / validateNestedEach → array wrapping
  const isArray = meta.type?.isArray || meta.flags.validateNestedEach;
  if (isArray) {
    const schema: JsonSchema202012 = { type: 'array', items: innerSchema };

    // Array-level rules (minItems, maxItems, uniqueItems)
    const arrayRules = filterByGroups(
      meta.validation.filter(rd => !rd.each), ctx.groups,
    );
    const arrayKeywords = mapRulesToSchema(arrayRules, ctx, fieldKey);
    if (arrayKeywords.minItems !== undefined) schema.minItems = arrayKeywords.minItems;
    if (arrayKeywords.maxItems !== undefined) schema.maxItems = arrayKeywords.maxItems;
    if (arrayKeywords.uniqueItems !== undefined) schema.uniqueItems = arrayKeywords.uniqueItems;

    if (meta.flags.isNullable) applyNullable(schema);
    return applyUserSchema(meta, schema);
  }

  if (meta.flags.isNullable) {
    if (innerSchema.$ref) {
      innerSchema = { oneOf: [innerSchema, { type: 'null' }] };
    } else if (innerSchema.oneOf) {
      innerSchema = { oneOf: [...innerSchema.oneOf, { type: 'null' }] };
    } else {
      // Defensive fallback — processNestedClass always returns $ref, so this branch
      // is unreachable in practice. Kept for safety if schema structure changes.
      applyNullable(innerSchema);
    }
  }
  return applyUserSchema(meta, innerSchema);
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility functions
// ─────────────────────────────────────────────────────────────────────────────

function filterByGroups(rules: RuleDef[], groups?: string[]): RuleDef[] {
  if (!groups) return rules;
  return rules.filter(rd => {
    if (!rd.groups || rd.groups.length === 0) return true;
    return rd.groups.some(g => groups.includes(g));
  });
}

function mapRulesToSchema(rules: RuleDef[], ctx?: SchemaContext, fieldKey?: string): JsonSchema202012 {
  const schema: JsonSchema202012 = {};
  for (const rd of rules) {
    const mapper = RULE_SCHEMA_MAP[rd.rule.ruleName];
    if (!mapper) {
      const name = rd.rule.ruleName;
      if (ctx?.onUnmappedRule) {
        ctx.onUnmappedRule(name, fieldKey ?? '<unknown>');
      } else if (!_warnedRules.has(name)) {
        _warnedRules.add(name);
        console.warn(`[baker] No JSON Schema mapping for rule "${name}"`);
      }
      continue;
    }
    const result = mapper(rd.rule.constraints ?? {});
    if (!result) continue;
    Object.assign(schema, result);
  }
  return schema;
}

function applyNullable(schema: JsonSchema202012): void {
  if (schema.type) {
    if (Array.isArray(schema.type)) {
      if (!schema.type.includes('null')) schema.type = [...schema.type, 'null'];
    } else {
      schema.type = schema.type === 'null' ? ['null'] : [schema.type, 'null'];
    }
  } else {
    schema.type = ['null'];
  }
}

function applyUserSchema(
  meta: RawPropertyMeta, autoSchema: JsonSchema202012,
): JsonSchema202012 {
  if (meta.schema == null) return autoSchema;

  if (typeof meta.schema === 'function') {
    // Function form: pass auto schema as argument, return result
    return meta.schema(autoSchema) as JsonSchema202012;
  }

  // Object form: composition-aware merge (§6.5)
  const userSchema = meta.schema as JsonSchema202012;
  const hasComposition = Object.keys(userSchema).some(k => COMPOSITION_KEYWORDS.has(k));
  return hasComposition ? { ...autoSchema, ...userSchema } : { ...autoSchema, ...userSchema };
}
