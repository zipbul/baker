import { describe, it, expect, afterEach } from 'bun:test';
import { RAW, RAW_CLASS_SCHEMA } from '../symbols';
import { globalRegistry } from '../registry';
import { ensureMeta, collectSchema, collectClassSchema } from '../collect';
import { toJsonSchema } from './to-json-schema';
import type { JsonSchema202012 } from '../types';

// Track all classes used in tests for cleanup in afterEach
const trackedClasses: Function[] = [];

function makeClass(name = 'TestDto'): new (...args: any[]) => any {
  const ctor = class {} as any;
  Object.defineProperty(ctor, 'name', { value: name });
  trackedClasses.push(ctor);
  globalRegistry.add(ctor);
  return ctor;
}

/** Helper to create rules conforming to RuleDef */
function fakeRule(ruleName: string, constraints: Record<string, unknown> = {}, each = false) {
  const fn = () => true;
  (fn as any).ruleName = ruleName;
  (fn as any).constraints = constraints;
  (fn as any).emit = () => '';
  return { rule: fn as any, each };
}

afterEach(() => {
  for (const cls of trackedClasses) {
    globalRegistry.delete(cls);
    delete (cls as any)[RAW];
    delete (cls as any)[RAW_CLASS_SCHEMA];
  }
  trackedClasses.length = 0;
});

// ─────────────────────────────────────────────────────────────────────────────
// Basic structure
// ─────────────────────────────────────────────────────────────────────────────

describe('toJsonSchema — basic structure', () => {
  it('empty DTO → { type: "object", properties: {} }', () => {
    const Dto = makeClass('EmptyDto');
    // mergeInheritance returns empty object even without calling ensureMeta
    const schema = toJsonSchema(Dto);
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.type).toBe('object');
    expect(schema.properties).toEqual({});
    expect(schema.required).toBeUndefined();
  });

  it('single string field', () => {
    const Dto = makeClass('StringDto');
    const meta = ensureMeta(Dto, 'name');
    meta.validation.push(fakeRule('isString'));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.name).toEqual({ type: 'string' });
    expect(schema.required).toEqual(['name']);
  });

  it('multiple fields + required determination', () => {
    const Dto = makeClass('MultiDto');
    const meta1 = ensureMeta(Dto, 'name');
    meta1.validation.push(fakeRule('isString'));

    const meta2 = ensureMeta(Dto, 'age');
    meta2.validation.push(fakeRule('isNumber'));

    const meta3 = ensureMeta(Dto, 'nickname');
    meta3.validation.push(fakeRule('isString'));
    meta3.flags.isOptional = true;

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.name).toEqual({ type: 'string' });
    expect(schema.properties!.age).toEqual({ type: 'number' });
    expect(schema.required).toContain('name');
    expect(schema.required).toContain('age');
    expect(schema.required).not.toContain('nickname');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Type mapping
// ─────────────────────────────────────────────────────────────────────────────

describe('toJsonSchema — type mapping', () => {
  it.each([
    ['isString', {}, { type: 'string' }],
    ['isNumber', {}, { type: 'number' }],
    ['isInt', {}, { type: 'integer' }],
    ['isBoolean', {}, { type: 'boolean' }],
    ['isDate', {}, { type: 'string', format: 'date-time' }],
    ['isArray', {}, { type: 'array' }],
    ['isObject', {}, { type: 'object' }],
  ] as const)('%s → %o', (ruleName, constraints, expected) => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'field');
    meta.validation.push(fakeRule(ruleName, constraints));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.field).toEqual(expected);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// enum / const
// ─────────────────────────────────────────────────────────────────────────────

describe('toJsonSchema — enum / const', () => {
  it('isEnum → enum', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'role');
    meta.validation.push(fakeRule('isEnum', { values: ['admin', 'user'] }));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.role).toEqual({ enum: ['admin', 'user'] });
  });

  it('isIn → enum', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'status');
    meta.validation.push(fakeRule('isIn', { values: ['active', 'inactive'] }));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.status).toEqual({ enum: ['active', 'inactive'] });
  });

  it('equals → const', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'type');
    meta.validation.push(fakeRule('equals', { value: 'fixed' }));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.type).toEqual({ const: 'fixed' });
  });

  it('notEquals → not.const', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'val');
    meta.validation.push(fakeRule('notEquals', { value: 'bad' }));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.val).toEqual({ not: { const: 'bad' } });
  });

  it('isNotIn → not.enum', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'val');
    meta.validation.push(fakeRule('isNotIn', { values: [1, 2, 3] }));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.val).toEqual({ not: { enum: [1, 2, 3] } });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Number constraints
// ─────────────────────────────────────────────────────────────────────────────

describe('toJsonSchema — numbers', () => {
  it('min/max (inclusive)', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'age');
    meta.validation.push(fakeRule('isNumber'));
    meta.validation.push(fakeRule('min', { min: 0 }));
    meta.validation.push(fakeRule('max', { max: 150 }));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.age).toEqual({
      type: 'number', minimum: 0, maximum: 150,
    });
  });

  it('min/max (exclusive)', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'score');
    meta.validation.push(fakeRule('min', { min: 0, exclusive: true }));
    meta.validation.push(fakeRule('max', { max: 100, exclusive: true }));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.score).toEqual({
      exclusiveMinimum: 0, exclusiveMaximum: 100,
    });
  });

  it('isPositive / isNegative', () => {
    const Dto = makeClass();
    const posM = ensureMeta(Dto, 'pos');
    posM.validation.push(fakeRule('isPositive'));
    const negM = ensureMeta(Dto, 'neg');
    negM.validation.push(fakeRule('isNegative'));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.pos).toEqual({ exclusiveMinimum: 0 });
    expect(schema.properties!.neg).toEqual({ exclusiveMaximum: 0 });
  });

  it('isDivisibleBy → multipleOf', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'val');
    meta.validation.push(fakeRule('isDivisibleBy', { divisor: 5 }));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.val).toEqual({ multipleOf: 5 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// String constraints
// ─────────────────────────────────────────────────────────────────────────────

describe('toJsonSchema — strings', () => {
  it('minLength / maxLength', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'name');
    meta.validation.push(fakeRule('isString'));
    meta.validation.push(fakeRule('minLength', { min: 1 }));
    meta.validation.push(fakeRule('maxLength', { max: 50 }));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.name).toEqual({
      type: 'string', minLength: 1, maxLength: 50,
    });
  });

  it('length → minLength + maxLength', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'code');
    meta.validation.push(fakeRule('length', { min: 3, max: 10 }));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.code).toEqual({ minLength: 3, maxLength: 10 });
  });

  it('matches → pattern', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'slug');
    meta.validation.push(fakeRule('matches', { pattern: '^[a-z-]+$' }));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.slug).toEqual({ pattern: '^[a-z-]+$' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Format mapping
// ─────────────────────────────────────────────────────────────────────────────

describe('toJsonSchema — format', () => {
  it.each([
    ['isEmail', {}, 'email'],
    ['isURL', {}, 'uri'],
    ['isUUID', {}, 'uuid'],
    ['isISO8601', {}, 'date-time'],
    ['isIP', { version: 4 }, 'ipv4'],
    ['isIP', { version: 6 }, 'ipv6'],
  ] as const)('%s → format: %s', (ruleName, constraints, expectedFormat) => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'field');
    meta.validation.push(fakeRule('isString'));
    meta.validation.push(fakeRule(ruleName, constraints));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.field!.format).toBe(expectedFormat);
  });

  it('isIP (version unspecified) → no schema mapping', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'ip');
    meta.validation.push(fakeRule('isString'));
    meta.validation.push(fakeRule('isIP', {}));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.ip).toEqual({ type: 'string' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Array constraints
// ─────────────────────────────────────────────────────────────────────────────

describe('toJsonSchema — arrays', () => {
  it('arrayMinSize / arrayMaxSize / arrayUnique', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'tags');
    meta.validation.push(fakeRule('isArray'));
    meta.validation.push(fakeRule('arrayMinSize', { min: 1 }));
    meta.validation.push(fakeRule('arrayMaxSize', { max: 10 }));
    meta.validation.push(fakeRule('arrayUnique'));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.tags).toEqual({
      type: 'array', minItems: 1, maxItems: 10, uniqueItems: true,
    });
  });

  it('arrayNotEmpty → minItems: 1', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'items');
    meta.validation.push(fakeRule('arrayNotEmpty'));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.items).toEqual({ minItems: 1 });
  });

  it('arrayContains → contains.enum', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'arr');
    meta.validation.push(fakeRule('arrayContains', { values: ['a', 'b'] }));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.arr).toEqual({
      contains: { enum: ['a', 'b'] },
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Object constraints
// ─────────────────────────────────────────────────────────────────────────────

describe('toJsonSchema — objects', () => {
  it('isNotEmptyObject → minProperties: 1', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'obj');
    meta.validation.push(fakeRule('isNotEmptyObject'));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.obj).toEqual({ minProperties: 1 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// @IsOptional / @IsDefined / @IsNullable flags
// ─────────────────────────────────────────────────────────────────────────────

describe('toJsonSchema — flags', () => {
  it('@IsOptional → excluded from required array', () => {
    const Dto = makeClass();
    const m1 = ensureMeta(Dto, 'required');
    m1.validation.push(fakeRule('isString'));
    const m2 = ensureMeta(Dto, 'optional');
    m2.validation.push(fakeRule('isString'));
    m2.flags.isOptional = true;

    const schema = toJsonSchema(Dto);
    expect(schema.required).toEqual(['required']);
  });

  it('@IsNullable → adds "null" to type array', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'field');
    meta.validation.push(fakeRule('isString'));
    meta.flags.isNullable = true;

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.field).toEqual({
      type: ['string', 'null'],
    });
  });

  it('@IsNullable (no type specified) → type: ["null"]', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'field');
    meta.flags.isNullable = true;

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.field).toEqual({ type: ['null'] });
  });

  // E-8: applyNullable — no duplicate null (→ B-11)
  it('@IsNullable + type already ["string","null"] → no duplicate null', () => {
    // Simulate a schema where type is already ['string', 'null'] by having isString + nullable
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'field');
    meta.validation.push(fakeRule('isString'));
    meta.flags.isNullable = true;

    const schema = toJsonSchema(Dto);
    const fieldSchema = schema.properties!.field!;
    // type should be exactly ['string', 'null'], no duplicates
    expect(fieldSchema.type).toEqual(['string', 'null']);
    const nullCount = (fieldSchema.type as string[]).filter(t => t === 'null').length;
    expect(nullCount).toBe(1);
  });

  it('@IsNullable + type already "null" → ["null"] (no duplicate)', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'field');
    meta.flags.isNullable = true;
    // No type rule → applyNullable with no existing type → type: ['null']

    const schema = toJsonSchema(Dto);
    const fieldSchema = schema.properties!.field!;
    expect(fieldSchema.type).toEqual(['null']);
    const nullCount = (fieldSchema.type as string[]).filter(t => t === 'null').length;
    expect(nullCount).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// each:true → items sub-schema (§6.10)
// ─────────────────────────────────────────────────────────────────────────────

describe('toJsonSchema — each:true', () => {
  it('each rules → mapped to items', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'emails');
    meta.validation.push(fakeRule('isArray'));
    meta.validation.push(fakeRule('arrayMinSize', { min: 1 }));
    meta.validation.push(fakeRule('isString', {}, true));
    meta.validation.push(fakeRule('isEmail', {}, true));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.emails).toEqual({
      type: 'array',
      minItems: 1,
      items: { type: 'string', format: 'email' },
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// @Exclude direction awareness (§6.9)
// ─────────────────────────────────────────────────────────────────────────────

describe('toJsonSchema — @Exclude', () => {
  it('@Exclude() → excluded in both directions', () => {
    const Dto = makeClass();
    const m1 = ensureMeta(Dto, 'visible');
    m1.validation.push(fakeRule('isString'));
    const m2 = ensureMeta(Dto, 'hidden');
    m2.validation.push(fakeRule('isString'));
    m2.exclude = {};

    const deser = toJsonSchema(Dto, { direction: 'deserialize' });
    const ser = toJsonSchema(Dto, { direction: 'serialize' });
    expect(deser.properties!.hidden).toBeUndefined();
    expect(ser.properties!.hidden).toBeUndefined();
  });

  it('@Exclude({ deserializeOnly: true }) → included in serialize', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'secret');
    meta.validation.push(fakeRule('isString'));
    meta.exclude = { deserializeOnly: true };

    const deser = toJsonSchema(Dto, { direction: 'deserialize' });
    const ser = toJsonSchema(Dto, { direction: 'serialize' });
    expect(deser.properties!.secret).toBeUndefined();
    expect(ser.properties!.secret).toEqual({ type: 'string' });
  });

  it('@Exclude({ serializeOnly: true }) → included in deserialize', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'password');
    meta.validation.push(fakeRule('isString'));
    meta.exclude = { serializeOnly: true };

    const deser = toJsonSchema(Dto, { direction: 'deserialize' });
    const ser = toJsonSchema(Dto, { direction: 'serialize' });
    expect(deser.properties!.password).toEqual({ type: 'string' });
    expect(ser.properties!.password).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// @Expose name / direction (§6.9)
// ─────────────────────────────────────────────────────────────────────────────

describe('toJsonSchema — @Expose', () => {
  it('@Expose({ name }) → schema key renamed', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'userName');
    meta.validation.push(fakeRule('isString'));
    meta.expose.push({ name: 'user_name' });

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.user_name).toEqual({ type: 'string' });
    expect(schema.properties!.userName).toBeUndefined();
    expect(schema.required).toEqual(['user_name']);
  });

  it('@Expose per-direction name mapping', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'firstName');
    meta.validation.push(fakeRule('isString'));
    meta.expose.push({ name: 'first_name', deserializeOnly: true });
    meta.expose.push({ name: 'firstName', serializeOnly: true });

    const deser = toJsonSchema(Dto, { direction: 'deserialize' });
    const ser = toJsonSchema(Dto, { direction: 'serialize' });
    expect(deser.properties!.first_name).toEqual({ type: 'string' });
    expect(ser.properties!.firstName).toEqual({ type: 'string' });
  });

  it('@Expose({ groups }) → groups filtering', () => {
    const Dto = makeClass();
    const m1 = ensureMeta(Dto, 'public');
    m1.validation.push(fakeRule('isString'));
    // no groups → always included

    const m2 = ensureMeta(Dto, 'admin');
    m2.validation.push(fakeRule('isString'));
    m2.expose.push({ groups: ['admin'] });

    const all = toJsonSchema(Dto);
    expect(all.properties!.public).toBeDefined();
    expect(all.properties!.admin).toBeDefined();

    const admin = toJsonSchema(Dto, { groups: ['admin'] });
    expect(admin.properties!.public).toBeDefined();
    expect(admin.properties!.admin).toBeDefined();

    const user = toJsonSchema(Dto, { groups: ['user'] });
    expect(user.properties!.public).toBeDefined();
    expect(user.properties!.admin).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// @Type/@Nested → $ref (§6.3)
// ─────────────────────────────────────────────────────────────────────────────

describe('toJsonSchema — nested DTOs', () => {
  it('simple @Type → $ref + $defs', () => {
    const AddressDto = makeClass('AddressDto');
    const addrMeta = ensureMeta(AddressDto, 'city');
    addrMeta.validation.push(fakeRule('isString'));

    const UserDto = makeClass('UserDto');
    const nameMeta = ensureMeta(UserDto, 'name');
    nameMeta.validation.push(fakeRule('isString'));
    const addrFieldMeta = ensureMeta(UserDto, 'address');
    addrFieldMeta.type = { fn: () => AddressDto as any };
    addrFieldMeta.flags.validateNested = true;

    const schema = toJsonSchema(UserDto);
    expect(schema.properties!.address).toEqual({ $ref: '#/$defs/AddressDto' });
    expect(schema.$defs!.AddressDto).toEqual({
      type: 'object',
      properties: { city: { type: 'string' } },
      required: ['city'],
    });
  });

  it('each:true → type: "array", items: { $ref }', () => {
    const ItemDto = makeClass('ItemDto');
    const iMeta = ensureMeta(ItemDto, 'name');
    iMeta.validation.push(fakeRule('isString'));

    const ListDto = makeClass('ListDto');
    const listMeta = ensureMeta(ListDto, 'items');
    listMeta.type = { fn: () => ItemDto as any };
    listMeta.flags.validateNestedEach = true;
    listMeta.validation.push(fakeRule('arrayMinSize', { min: 1 }));

    const schema = toJsonSchema(ListDto);
    expect(schema.properties!.items).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/ItemDto' },
      minItems: 1,
    });
  });

  it('discriminator → oneOf + const', () => {
    const DogDto = makeClass('DogDto');
    const dogBark = ensureMeta(DogDto, 'bark');
    dogBark.validation.push(fakeRule('isString'));

    const CatDto = makeClass('CatDto');
    const catMeow = ensureMeta(CatDto, 'meow');
    catMeow.validation.push(fakeRule('isString'));

    const PetDto = makeClass('PetDto');
    const petMeta = ensureMeta(PetDto, 'pet');
    petMeta.type = {
      fn: () => DogDto as any, // fn isn't used for discriminator
      discriminator: {
        property: 'type',
        subTypes: [
          { value: DogDto, name: 'dog' },
          { value: CatDto, name: 'cat' },
        ],
      },
    };
    petMeta.flags.validateNested = true;

    const schema = toJsonSchema(PetDto);
    expect(schema.properties!.pet).toEqual({
      oneOf: [
        {
          allOf: [
            { $ref: '#/$defs/DogDto' },
            { properties: { type: { const: 'dog' } }, required: ['type'] },
          ],
        },
        {
          allOf: [
            { $ref: '#/$defs/CatDto' },
            { properties: { type: { const: 'cat' } }, required: ['type'] },
          ],
        },
      ],
    });
  });

  // E-9: verify $ref and properties are NOT at the same level (→ C-3)
  it('discriminator oneOf entries should not have $ref and properties as siblings', () => {
    const DogDto = makeClass('DogE9');
    const dogM = ensureMeta(DogDto, 'bark');
    dogM.validation.push(fakeRule('isString'));

    const CatDto = makeClass('CatE9');
    const catM = ensureMeta(CatDto, 'meow');
    catM.validation.push(fakeRule('isString'));

    const PetDto = makeClass('PetE9');
    const petMeta = ensureMeta(PetDto, 'pet');
    petMeta.type = {
      fn: () => DogDto as any,
      discriminator: {
        property: 'type',
        subTypes: [
          { value: DogDto, name: 'dog' },
          { value: CatDto, name: 'cat' },
        ],
      },
    };
    petMeta.flags.validateNested = true;

    const schema = toJsonSchema(PetDto);
    const pet = schema.properties!.pet!;
    for (const entry of pet.oneOf!) {
      // $ref and properties must NOT coexist at the same level
      expect(entry.$ref).toBeUndefined();
      expect(entry.allOf).toBeDefined();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Circular references (§6.2)
// ─────────────────────────────────────────────────────────────────────────────

describe('toJsonSchema — circular references', () => {
  it('A → B → A cycle', () => {
    const A = makeClass('A');
    const B = makeClass('B');

    const aMeta = ensureMeta(A, 'b');
    aMeta.type = { fn: () => B as any };
    aMeta.flags.validateNested = true;

    const bMeta = ensureMeta(B, 'a');
    bMeta.type = { fn: () => A as any };
    bMeta.flags.validateNested = true;

    const schema = toJsonSchema(A);

    // A is inlined at root, and also registered in $defs due to circular reference
    expect(schema.type).toBe('object');
    expect(schema.properties!.b).toEqual({ $ref: '#/$defs/B' });
    expect(schema.$defs!.B!.properties!.a).toEqual({ $ref: '#/$defs/A' });
    expect(schema.$defs!.A).toBeDefined();
  });

  it('self-reference', () => {
    const Node = makeClass('Node');
    const childMeta = ensureMeta(Node, 'child');
    childMeta.type = { fn: () => Node as any };
    childMeta.flags.validateNested = true;
    childMeta.flags.isOptional = true;

    const schema = toJsonSchema(Node);
    expect(schema.properties!.child).toEqual({ $ref: '#/$defs/Node' });
    expect(schema.$defs!.Node).toBeDefined();
  });

  it('same-named class disambiguation', () => {
    const A1 = makeClass('Item');
    const A2 = makeClass('Item');
    const nameMeta1 = ensureMeta(A1, 'x');
    nameMeta1.validation.push(fakeRule('isString'));
    const nameMeta2 = ensureMeta(A2, 'y');
    nameMeta2.validation.push(fakeRule('isNumber'));

    const Root = makeClass('Root');
    const m1 = ensureMeta(Root, 'a');
    m1.type = { fn: () => A1 as any };
    m1.flags.validateNested = true;
    const m2 = ensureMeta(Root, 'b');
    m2.type = { fn: () => A2 as any };
    m2.flags.validateNested = true;

    const schema = toJsonSchema(Root);
    expect(schema.$defs!.Item).toBeDefined();
    expect(schema.$defs!.Item_2).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// @Schema — property level (§6.5, §6.6)
// ─────────────────────────────────────────────────────────────────────────────

describe('toJsonSchema — @Schema (property)', () => {
  it('object form: override auto-mapping', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'name');
    meta.validation.push(fakeRule('isString'));
    meta.validation.push(fakeRule('minLength', { min: 1 }));
    collectSchema(Dto.prototype, 'name', { minLength: 5, description: 'User name' });

    const schema = toJsonSchema(Dto);
    // @Schema takes priority → minLength is 5 (overrides auto-mapped 1)
    expect(schema.properties!.name).toEqual({
      type: 'string', minLength: 5, description: 'User name',
    });
  });

  it('function form: control auto schema', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'value');
    meta.validation.push(fakeRule('isString'));
    collectSchema(Dto.prototype, 'value', (auto: Record<string, unknown>) => ({
      ...auto,
      anyOf: [{ type: 'string' }, { type: 'number' }],
    }));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.value!.anyOf).toEqual([
      { type: 'string' }, { type: 'number' },
    ]);
  });

  it('composition-aware merge: auto-mapping preserved with allOf', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'field');
    meta.validation.push(fakeRule('isString'));
    meta.validation.push(fakeRule('minLength', { min: 3 }));
    collectSchema(Dto.prototype, 'field', {
      allOf: [{ minLength: 1 }, { maxLength: 100 }],
    });

    const schema = toJsonSchema(Dto);
    // C-15: auto-mapping (type, minLength) is preserved as base even with composition keywords
    expect(schema.properties!.field).toEqual({
      type: 'string', minLength: 3,
      allOf: [{ minLength: 1 }, { maxLength: 100 }],
    });
    expect(schema.properties!.field!.type).toBe('string');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// @Schema — class level (§6.8)
// ─────────────────────────────────────────────────────────────────────────────

describe('toJsonSchema — @Schema (class)', () => {
  it('class-level metadata merged into root', () => {
    const Dto = makeClass('CreateUserDto');
    const meta = ensureMeta(Dto, 'name');
    meta.validation.push(fakeRule('isString'));
    collectClassSchema(Dto, {
      title: 'CreateUserRequest',
      description: 'User creation payload',
    });

    const schema = toJsonSchema(Dto);
    expect(schema.title).toBe('CreateUserRequest');
    expect(schema.description).toBe('User creation payload');
    expect(schema.type).toBe('object');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Unmapped rules → auto-skip
// ─────────────────────────────────────────────────────────────────────────────

describe('toJsonSchema — unregistered rule skip', () => {
  it('custom rules are silently ignored', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'field');
    meta.validation.push(fakeRule('isString'));
    meta.validation.push(fakeRule('customRule', { foo: 'bar' }));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.field).toEqual({ type: 'string' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Groups filtering (§6.4)
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// whitelist → unevaluatedProperties: false (§7.2)
// ─────────────────────────────────────────────────────────────────────────────

describe('toJsonSchema — whitelist', () => {
  it('whitelist: true → unevaluatedProperties: false', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'name');
    meta.validation.push(fakeRule('isString'));

    const schema = toJsonSchema(Dto, { whitelist: true });
    expect(schema.unevaluatedProperties).toBe(false);
  });

  it('whitelist: false (default) → unevaluatedProperties not emitted', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'name');
    meta.validation.push(fakeRule('isString'));

    const schema = toJsonSchema(Dto);
    expect(schema.unevaluatedProperties).toBeUndefined();
  });

  it('whitelist: also applied to nested schemas in $defs', () => {
    const Inner = makeClass('Inner');
    const iMeta = ensureMeta(Inner, 'x');
    iMeta.validation.push(fakeRule('isNumber'));

    const Outer = makeClass('Outer');
    const oMeta = ensureMeta(Outer, 'inner');
    oMeta.type = { fn: () => Inner as any };
    oMeta.flags.validateNested = true;

    const schema = toJsonSchema(Outer, { whitelist: true });
    expect(schema.unevaluatedProperties).toBe(false);
    expect(schema.$defs!.Inner!.unevaluatedProperties).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// min/max exclusive → exclusiveMinimum/Maximum (§7.1)
// ─────────────────────────────────────────────────────────────────────────────

describe('toJsonSchema — exclusive min/max', () => {
  it('min(n, {exclusive:true}) → exclusiveMinimum', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'val');
    meta.validation.push(fakeRule('min', { min: 0, exclusive: true }));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.val).toEqual({ exclusiveMinimum: 0 });
  });

  it('max(n, {exclusive:true}) → exclusiveMaximum', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'val');
    meta.validation.push(fakeRule('max', { max: 100, exclusive: true }));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.val).toEqual({ exclusiveMaximum: 100 });
  });
});

describe('toJsonSchema — groups', () => {
  it('groups filtering includes only rules of specific group', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'name');
    meta.validation.push(fakeRule('isString'));
    meta.validation.push({
      ...fakeRule('minLength', { min: 3 }),
      groups: ['create'],
    });
    meta.validation.push({
      ...fakeRule('maxLength', { max: 100 }),
      groups: ['update'],
    });

    const create = toJsonSchema(Dto, { groups: ['create'] });
    expect(create.properties!.name).toEqual({
      type: 'string', minLength: 3,
    });

    const update = toJsonSchema(Dto, { groups: ['update'] });
    expect(update.properties!.name).toEqual({
      type: 'string', maxLength: 100,
    });
  });

  it('no groups specified → all rules included', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'name');
    meta.validation.push(fakeRule('isString'));
    meta.validation.push({
      ...fakeRule('minLength', { min: 3 }),
      groups: ['create'],
    });

    const all = toJsonSchema(Dto);
    expect(all.properties!.name).toEqual({
      type: 'string', minLength: 3,
    });
  });
});
