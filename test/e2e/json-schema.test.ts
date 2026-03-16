import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  deserialize, toJsonSchema,
  Field, arrayOf,
} from '../../index';
import { unseal } from '../integration/helpers/unseal';

beforeEach(() => unseal());
afterEach(() => unseal());
import {
  isString, isNumber, isInt, isBoolean, isDate, isEnum, isArray, isObject,
  min, max, isPositive, isNegative,
  minLength, maxLength, isEmail, isUUID, isIP, isISO8601,
  equals, notEquals, isIn, isNotIn,
  arrayMinSize, arrayMaxSize, arrayUnique, arrayNotEmpty, arrayContains,
  isNotEmptyObject, matches,
} from '../../src/rules/index';
import type { JsonSchema202012 } from '../../index';

// ═════════════════════════════════════════════════════════════════════════════
// type mapping
// ═════════════════════════════════════════════════════════════════════════════

describe('toJsonSchema type mapping', () => {
  class TypesDto {
    @Field(isString)  str!: string;
    @Field(isNumber())  num!: number;
    @Field(isInt)     int!: number;
    @Field(isBoolean) bool!: boolean;
    @Field(isDate)    date!: Date;
    @Field(isArray)   arr!: unknown[];
    @Field(isObject)  obj!: object;
  }

  it('basic types → JSON Schema type', () => {
    const s = toJsonSchema(TypesDto);
    expect(s.properties!.str).toEqual({ type: 'string' });
    expect(s.properties!.num).toEqual({ type: 'number' });
    expect(s.properties!.int).toEqual({ type: 'integer' });
    expect(s.properties!.bool).toEqual({ type: 'boolean' });
    expect(s.properties!.date).toEqual({ type: 'string', format: 'date-time' });
    expect(s.properties!.arr).toEqual({ type: 'array' });
    expect(s.properties!.obj).toEqual({ type: 'object' });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// enum / const
// ═════════════════════════════════════════════════════════════════════════════

describe('toJsonSchema enum/const', () => {
  enum Role { Admin = 'admin', User = 'user' }

  class EnumDto {
    @Field(isEnum(Role))   role!: Role;
    @Field(isIn(['a','b'])) status!: string;
    @Field(equals('fixed')) type!: string;
  }

  it('enum, isIn, equals mapping', () => {
    const s = toJsonSchema(EnumDto);
    expect(s.properties!.role).toEqual({ enum: ['admin', 'user'] });
    expect(s.properties!.status).toEqual({ enum: ['a', 'b'] });
    expect(s.properties!.type).toEqual({ const: 'fixed' });
  });

  class NegDto {
    @Field(notEquals('bad')) val1!: unknown;
    @Field(isNotIn([1,2]))   val2!: unknown;
  }

  it('notEquals, isNotIn mapping', () => {
    const s = toJsonSchema(NegDto);
    expect(s.properties!.val1).toEqual({ not: { const: 'bad' } });
    expect(s.properties!.val2).toEqual({ not: { enum: [1, 2] } });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// number constraints
// ═════════════════════════════════════════════════════════════════════════════

describe('toJsonSchema numbers', () => {
  class NumDto {
    @Field(isNumber(), min(0), max(100)) range!: number;
    @Field(isPositive)  pos!: number;
    @Field(isNegative)  neg!: number;
  }

  it('min/max, isPositive, isNegative', () => {
    const s = toJsonSchema(NumDto);
    expect(s.properties!.range).toEqual({ type: 'number', minimum: 0, maximum: 100 });
    expect(s.properties!.pos).toEqual({ exclusiveMinimum: 0 });
    expect(s.properties!.neg).toEqual({ exclusiveMaximum: 0 });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// string constraints + format
// ═════════════════════════════════════════════════════════════════════════════

describe('toJsonSchema string + format', () => {
  class StrDto {
    @Field(isString, minLength(1), maxLength(50)) name!: string;
    @Field(isString, matches(/^[a-z-]+$/)) slug!: string;
    @Field(isEmail())   email!: string;
    @Field(isUUID())    uuid!: string;
    @Field(isISO8601()) ts!: string;
    @Field(isIP(4))     ip4!: string;
    @Field(isIP(6))     ip6!: string;
    @Field(isIP())      ipAny!: string;
  }

  it('string constraints + format mapping', () => {
    const s = toJsonSchema(StrDto);
    expect(s.properties!.name).toEqual({ type: 'string', minLength: 1, maxLength: 50 });
    expect(s.properties!.slug!.pattern).toBe('^[a-z-]+$');
    expect(s.properties!.email).toEqual({ format: 'email' });
    expect(s.properties!.uuid).toEqual({ format: 'uuid' });
    expect(s.properties!.ts).toEqual({ format: 'date-time' });
    expect(s.properties!.ip4).toEqual({ format: 'ipv4' });
    expect(s.properties!.ip6).toEqual({ format: 'ipv6' });
    // @IsIP() without version → no format mapping
    expect(s.properties!.ipAny!.format).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// array constraints
// ═════════════════════════════════════════════════════════════════════════════

describe('toJsonSchema arrays', () => {
  class ArrDto {
    @Field(isArray, arrayMinSize(1), arrayMaxSize(10), arrayUnique()) tags!: string[];
    @Field(arrayNotEmpty) items!: unknown[];
    @Field(arrayContains(['a','b'])) must!: string[];
  }

  it('array constraints mapping', () => {
    const s = toJsonSchema(ArrDto);
    expect(s.properties!.tags).toEqual({
      type: 'array', minItems: 1, maxItems: 10, uniqueItems: true,
    });
    expect(s.properties!.items).toEqual({ minItems: 1 });
    expect(s.properties!.must).toEqual({ contains: { enum: ['a', 'b'] } });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// each:true → items sub-schema
// ═════════════════════════════════════════════════════════════════════════════

describe('toJsonSchema each:true', () => {
  class EachDto {
    @Field(isArray, arrayMinSize(1), arrayOf(isString, minLength(1)))
    names!: string[];
  }

  it('each rules → mapped to items, non-each → array level', () => {
    const s = toJsonSchema(EachDto);
    expect(s.properties!.names).toEqual({
      type: 'array',
      minItems: 1,
      items: { type: 'string', minLength: 1 },
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// @Expose / @Exclude direction
// ═════════════════════════════════════════════════════════════════════════════

describe('toJsonSchema direction', () => {
  class DirDto {
    @Field(isString, { deserializeName: 'user_name', serializeName: 'userName' })
    name!: string;

    @Field(isString, { exclude: 'serializeOnly' })
    password!: string;

    @Field(isString, { exclude: true })
    internal!: string;
  }

  it('direction: deserialize', () => {
    const s = toJsonSchema(DirDto, { direction: 'deserialize' });
    expect(s.properties!.user_name).toBeDefined();
    expect(s.properties!.userName).toBeUndefined();
    expect(s.properties!.password).toBeDefined();
    expect(s.properties!.internal).toBeUndefined();
  });

  it('direction: serialize', () => {
    const s = toJsonSchema(DirDto, { direction: 'serialize' });
    expect(s.properties!.userName).toBeDefined();
    expect(s.properties!.user_name).toBeUndefined();
    expect(s.properties!.password).toBeUndefined();
    expect(s.properties!.internal).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// @Field({ schema: ... })
// ═════════════════════════════════════════════════════════════════════════════

describe('toJsonSchema @Field({ schema })', () => {
  class TitledDto {
    @Field(isString, minLength(1), { schema: { description: 'Display name', minLength: 3 } })
    name!: string;

    @Field(isString, { schema: { allOf: [{ minLength: 1 }, { maxLength: 100 }] } })
    composed!: string;

    @Field(isString)
    custom!: string;
  }

  it('property-level object schema → override', () => {
    const s = toJsonSchema(TitledDto);
    expect(s.properties!.name!.minLength).toBe(3); // schema overrides auto-mapped 1
    expect(s.properties!.name!.description).toBe('Display name');
  });

  it('composition-aware → auto-mapping retained as base (C-15)', () => {
    const s = toJsonSchema(TitledDto);
    expect(s.properties!.composed!.type).toBe('string');
    expect(s.properties!.composed!.allOf).toBeDefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// groups
// ═════════════════════════════════════════════════════════════════════════════

describe('toJsonSchema groups', () => {
  class GroupDto {
    @Field(isString) name!: string;

    @Field(isString, { groups: ['admin'] })
    secret!: string;

    @Field(isNumber())
    score!: number;
  }

  it('expose groups mismatch → field excluded', () => {
    const s = toJsonSchema(GroupDto, { groups: ['user'] });
    expect(s.properties!.name).toBeDefined();
    expect(s.properties!.secret).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// circular reference
// ═════════════════════════════════════════════════════════════════════════════

describe('toJsonSchema circular reference', () => {
  class TreeNode {
    @Field(isString) value!: string;

    @Field({ type: () => TreeNode, optional: true })
    child?: TreeNode;
  }

  it('self-reference → $ref + $defs', () => {
    const s = toJsonSchema(TreeNode);
    expect(s.properties!.child).toEqual({ $ref: '#/$defs/TreeNode' });
    expect(s.$defs!.TreeNode).toBeDefined();
    expect(s.$defs!.TreeNode!.properties!.value).toEqual({ type: 'string' });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// optional → excluded from required
// ═════════════════════════════════════════════════════════════════════════════

describe('toJsonSchema optional → excluded from required', () => {
  class OptDto {
    @Field(isString) name!: string;
    @Field(isNumber(), { optional: true }) age?: number;
  }

  it('required includes only name, excludes age', () => {
    const s = toJsonSchema(OptDto);
    expect(s.required).toContain('name');
    expect(s.required).not.toContain('age');
  });

  it('age property exists in schema', () => {
    const s = toJsonSchema(OptDto);
    expect(s.properties!.age).toBeDefined();
    expect(s.properties!.age!.type).toBe('number');
  });
});
