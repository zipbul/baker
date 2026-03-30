import { describe, it, expect, afterEach } from 'bun:test';
import { getMeta, Field } from '../../index';
import type { RawPropertyMeta } from '../../index';
import {
  isString, isBoolean, isEnum, isInt, isArray,
  min, max, minLength, maxLength, isEmail, isIP,
  arrayMinSize, arrayMaxSize, arrayUnique,
} from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────
// OAS 3.1 Schema Generation from getMeta
// ─────────────────────────────────────────────────────────────────────────────

function metaFieldToOASProperty(prop: RawPropertyMeta, resolveRef: (cls: Function) => any): any {
  const schema: any = {};

  for (const rd of prop.validation) {
    const c = rd.rule.constraints ?? {};
    switch (rd.rule.ruleName) {
      case 'isString': schema.type = 'string'; break;
      case 'isNumber': schema.type = 'number'; break;
      case 'isInt': schema.type = 'integer'; break;
      case 'isBoolean': schema.type = 'boolean'; break;
      case 'isEmail': schema.format = 'email'; break;
      case 'isIP': schema.format = c.version === 4 ? 'ipv4' : c.version === 6 ? 'ipv6' : 'ip'; break;
      case 'min': schema.minimum = c.min; break;
      case 'max': schema.maximum = c.max; break;
      case 'minLength': schema.minLength = c.min; break;
      case 'maxLength': schema.maxLength = c.max; break;
      case 'isEnum': schema.enum = c.values; break;
      case 'arrayMinSize': schema.minItems = c.min; break;
      case 'arrayMaxSize': schema.maxItems = c.max; break;
      case 'arrayUnique': schema.uniqueItems = true; break;
      case 'isArray': schema.type = 'array'; break;
    }
  }

  if (prop.type?.discriminator) {
    const disc = prop.type.discriminator;
    schema.oneOf = disc.subTypes.map(sub => ({
      $ref: `#/components/schemas/${(sub.value as any).name}`,
    }));
    schema.discriminator = {
      propertyName: disc.property,
      mapping: Object.fromEntries(disc.subTypes.map(sub => [sub.name, `#/components/schemas/${(sub.value as any).name}`])),
    };
  } else if (prop.type?.resolvedClass) {
    const ref = resolveRef(prop.type.resolvedClass);
    if (prop.type.isArray) {
      schema.type = 'array';
      schema.items = ref;
    } else {
      Object.assign(schema, ref);
    }
  } else if (prop.type?.collection === 'Set') {
    schema.type = 'array';
    schema.uniqueItems = true;
    if (prop.type.resolvedCollectionValue) {
      schema.items = resolveRef(prop.type.resolvedCollectionValue);
    }
  } else if (prop.type?.collection === 'Map') {
    schema.type = 'object';
    if (prop.type.resolvedCollectionValue) {
      schema.additionalProperties = resolveRef(prop.type.resolvedCollectionValue);
    }
  }

  if (prop.flags.isNullable) {
    if (schema.type) {
      schema.type = Array.isArray(schema.type) ? [...schema.type, 'null'] : [schema.type, 'null'];
    } else if (schema.oneOf) {
      schema.oneOf.push({ type: 'null' });
    }
  }

  if (prop.flags.isOptional) {
    // OAS: not in required array (handled externally)
  }

  const expose = prop.expose.find(e => e.name);
  if (expose?.name) {
    schema['x-baker-name'] = expose.name;
  }

  return schema;
}

function metaToOAS(Class: Function): any {
  const meta = getMeta(Class);
  const properties: any = {};
  const required: string[] = [];
  const resolveRef = (cls: Function) => ({ $ref: `#/components/schemas/${cls.name}` });

  for (const [field, prop] of Object.entries(meta)) {
    if (prop.exclude) continue;
    const key = prop.expose.find(e => e.name)?.name ?? field;
    properties[key] = metaFieldToOASProperty(prop, resolveRef);
    if (!prop.flags.isOptional) required.push(key);
  }

  return {
    type: 'object',
    properties,
    ...(required.length ? { required } : {}),
  };
}

// ── Test DTOs ────────────────────────────────────────────────────────────────

enum Role { Admin = 'admin', User = 'user' }

class AddressDto {
  @Field(isString, minLength(1)) street!: string;
  @Field(isString) city!: string;
  @Field(isString, { optional: true }) zip?: string;
}

class CatDto { @Field(isString) meow!: string; }
class DogDto { @Field(isString) bark!: string; }

class TagDto { @Field(isString) label!: string; }

class FullDto {
  @Field(isString, minLength(2), maxLength(50)) name!: string;
  @Field(isInt, min(0), max(150)) age!: number;
  @Field(isString, isEmail()) email!: string;
  @Field(isBoolean) active!: boolean;
  @Field(isEnum(Role)) role!: Role;
  @Field({ type: () => AddressDto }) address!: AddressDto;
  @Field({ type: () => [AddressDto] }) addresses!: AddressDto[];
  @Field(isString, { optional: true, nullable: true }) bio?: string | null;
  @Field(isString, { name: 'user_tag' }) tag!: string;
  @Field(isString, { exclude: true }) password!: string;
  @Field({
    type: () => CatDto,
    discriminator: { property: 'kind', subTypes: [{ value: CatDto, name: 'cat' }, { value: DogDto, name: 'dog' }] },
  }) pet!: CatDto | DogDto;
  @Field({ type: () => Set as any, setValue: () => TagDto }) tags!: Set<TagDto>;
  @Field({ type: () => Map as any, mapValue: () => TagDto }) tagMap!: Map<string, TagDto>;
  @Field(isIP(4)) ipv4!: string;
  @Field(isArray, arrayMinSize(1), arrayMaxSize(100), arrayUnique()) items!: string[];
}

describe('OAS 3.1 full generation from getMeta', () => {
  it('generates complete OAS schema for complex DTO', () => {
    const oas = metaToOAS(FullDto);
    expect(oas.type).toBe('object');
    expect(Object.keys(oas.properties).length).toBeGreaterThanOrEqual(14);
  });

  it('string field → type: string + minLength + maxLength', () => {
    const oas = metaToOAS(FullDto);
    expect(oas.properties.name).toEqual({ type: 'string', minLength: 2, maxLength: 50 });
  });

  it('integer field → type: integer + min + max', () => {
    const oas = metaToOAS(FullDto);
    expect(oas.properties.age).toEqual({ type: 'integer', minimum: 0, maximum: 150 });
  });

  it('email field → format: email', () => {
    const oas = metaToOAS(FullDto);
    expect(oas.properties.email).toEqual({ type: 'string', format: 'email' });
  });

  it('boolean field → type: boolean', () => {
    const oas = metaToOAS(FullDto);
    expect(oas.properties.active).toEqual({ type: 'boolean' });
  });

  it('enum field → enum values', () => {
    const oas = metaToOAS(FullDto);
    expect(oas.properties.role.enum).toEqual(['admin', 'user']);
  });

  it('nested DTO → $ref', () => {
    const oas = metaToOAS(FullDto);
    expect(oas.properties.address).toEqual({ $ref: '#/components/schemas/AddressDto' });
  });

  it('array nested DTO → type: array + items $ref', () => {
    const oas = metaToOAS(FullDto);
    expect(oas.properties.addresses).toEqual({ type: 'array', items: { $ref: '#/components/schemas/AddressDto' } });
  });

  it('nullable optional → type array with null', () => {
    const oas = metaToOAS(FullDto);
    expect(oas.properties.bio.type).toEqual(['string', 'null']);
  });

  it('expose name → output key changed', () => {
    const oas = metaToOAS(FullDto);
    expect(oas.properties['user_tag']).toBeDefined();
    expect(oas.properties['tag']).toBeUndefined();
  });

  it('excluded field not in output', () => {
    const oas = metaToOAS(FullDto);
    expect(oas.properties['password']).toBeUndefined();
  });

  it('required array excludes optional fields', () => {
    const oas = metaToOAS(FullDto);
    expect(oas.required).toContain('name');
    expect(oas.required).not.toContain('bio');
  });

  it('discriminator → oneOf + discriminator object', () => {
    const oas = metaToOAS(FullDto);
    expect(oas.properties.pet.oneOf).toHaveLength(2);
    expect(oas.properties.pet.discriminator.propertyName).toBe('kind');
    expect(oas.properties.pet.discriminator.mapping.cat).toBe('#/components/schemas/CatDto');
    expect(oas.properties.pet.discriminator.mapping.dog).toBe('#/components/schemas/DogDto');
  });

  it('Set → array + uniqueItems + items $ref', () => {
    const oas = metaToOAS(FullDto);
    expect(oas.properties.tags).toEqual({
      type: 'array', uniqueItems: true, items: { $ref: '#/components/schemas/TagDto' },
    });
  });

  it('Map → object + additionalProperties $ref', () => {
    const oas = metaToOAS(FullDto);
    expect(oas.properties.tagMap).toEqual({
      type: 'object', additionalProperties: { $ref: '#/components/schemas/TagDto' },
    });
  });

  it('IP v4 → format: ipv4', () => {
    const oas = metaToOAS(FullDto);
    expect(oas.properties.ipv4.format).toBe('ipv4');
  });

  it('array with constraints → minItems + maxItems + uniqueItems', () => {
    const oas = metaToOAS(FullDto);
    expect(oas.properties.items.type).toBe('array');
    expect(oas.properties.items.minItems).toBe(1);
    expect(oas.properties.items.maxItems).toBe(100);
    expect(oas.properties.items.uniqueItems).toBe(true);
  });

  it('nested DTO is independently resolvable via getMeta', () => {
    const addressOAS = metaToOAS(AddressDto);
    expect(addressOAS.properties.street).toEqual({ type: 'string', minLength: 1 });
    expect(addressOAS.required).toContain('street');
    expect(addressOAS.required).toContain('city');
    expect(addressOAS.required).not.toContain('zip');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GraphQL Schema Generation from getMeta
// ─────────────────────────────────────────────────────────────────────────────

function metaToGraphQLType(prop: RawPropertyMeta, resolveType: (cls: Function) => string): string {
  let baseType = '';

  if (prop.type?.resolvedClass) {
    baseType = resolveType(prop.type.resolvedClass);
    if (prop.type.isArray) baseType = `[${baseType}!]`;
  } else if (prop.type?.collection === 'Set') {
    const inner = prop.type.resolvedCollectionValue ? resolveType(prop.type.resolvedCollectionValue) : 'String';
    baseType = `[${inner}!]`;
  } else if (prop.type?.collection === 'Map') {
    baseType = 'JSON';
  } else if (prop.type?.discriminator) {
    baseType = prop.type.discriminator.subTypes.map(s => (s.value as any).name).join(' | ');
  } else {
    for (const rd of prop.validation) {
      switch (rd.rule.ruleName) {
        case 'isString': case 'isEmail': baseType = 'String'; break;
        case 'isNumber': baseType = 'Float'; break;
        case 'isInt': baseType = 'Int'; break;
        case 'isBoolean': baseType = 'Boolean'; break;
        case 'isEnum': baseType = 'Enum'; break;
        case 'isArray': baseType = baseType || '[String]'; break;
      }
    }
  }
  if (!baseType) baseType = 'String';

  const nullable = prop.flags.isNullable || prop.flags.isOptional;
  return nullable ? baseType : `${baseType}!`;
}

function metaToGraphQL(name: string, Class: Function): string {
  const meta = getMeta(Class);
  const resolveType = (cls: Function) => cls.name;
  const fields: string[] = [];

  for (const [field, prop] of Object.entries(meta)) {
    if (prop.exclude) continue;
    const key = prop.expose.find(e => e.name)?.name ?? field;
    const type = metaToGraphQLType(prop, resolveType);
    fields.push(`  ${key}: ${type}`);
  }

  return `type ${name} {\n${fields.join('\n')}\n}`;
}

class GqlDto {
  @Field(isString) name!: string;
  @Field(isInt, min(0)) age!: number;
  @Field(isBoolean) active!: boolean;
  @Field(isString, { optional: true }) bio?: string;
  @Field(isString, { nullable: true }) nickname!: string | null;
  @Field({ type: () => AddressDto }) address!: AddressDto;
  @Field({ type: () => [AddressDto] }) addresses!: AddressDto[];
  @Field(isString, { name: 'display_name' }) displayName!: string;
  @Field(isString, { exclude: true }) secret!: string;
}

describe('GraphQL type generation from getMeta', () => {
  it('generates valid GraphQL type string', () => {
    const gql = metaToGraphQL('GqlDto', GqlDto);
    expect(gql).toStartWith('type GqlDto {');
    expect(gql).toEndWith('}');
  });

  it('required String! field', () => {
    const gql = metaToGraphQL('GqlDto', GqlDto);
    expect(gql).toContain('name: String!');
  });

  it('required Int! field', () => {
    const gql = metaToGraphQL('GqlDto', GqlDto);
    expect(gql).toContain('age: Int!');
  });

  it('required Boolean! field', () => {
    const gql = metaToGraphQL('GqlDto', GqlDto);
    expect(gql).toContain('active: Boolean!');
  });

  it('optional field → nullable (no !)', () => {
    const gql = metaToGraphQL('GqlDto', GqlDto);
    expect(gql).toContain('bio: String');
    expect(gql).not.toContain('bio: String!');
  });

  it('nullable field → nullable (no !)', () => {
    const gql = metaToGraphQL('GqlDto', GqlDto);
    expect(gql).toContain('nickname: String');
    expect(gql).not.toContain('nickname: String!');
  });

  it('nested DTO → type name', () => {
    const gql = metaToGraphQL('GqlDto', GqlDto);
    expect(gql).toContain('address: AddressDto!');
  });

  it('array nested → [TypeName!]!', () => {
    const gql = metaToGraphQL('GqlDto', GqlDto);
    expect(gql).toContain('addresses: [AddressDto!]!');
  });

  it('expose name mapping → uses mapped name', () => {
    const gql = metaToGraphQL('GqlDto', GqlDto);
    expect(gql).toContain('display_name: String!');
    expect(gql).not.toContain('displayName:');
  });

  it('excluded field not in output', () => {
    const gql = metaToGraphQL('GqlDto', GqlDto);
    expect(gql).not.toContain('secret');
  });

  it('nested DTO independently generates valid GraphQL', () => {
    const gql = metaToGraphQL('AddressDto', AddressDto);
    expect(gql).toContain('street: String!');
    expect(gql).toContain('city: String!');
    expect(gql).toContain('zip: String');
    expect(gql).not.toContain('zip: String!');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Chaos: getMeta under stress
// ─────────────────────────────────────────────────────────────────────────────

describe('getMeta chaos', () => {
  it('getMeta 1000 times on same class returns same reference', () => {
    class StableDto { @Field(isString) v!: string; }
    const first = getMeta(StableDto);
    for (let i = 0; i < 1000; i++) {
      expect(getMeta(StableDto)).toBe(first);
    }
  });

  it('OAS generation on deeply nested DTO (5 levels)', () => {
    class L5 { @Field(isString) v!: string; }
    class L4 { @Field({ type: () => L5 }) c!: L5; }
    class L3 { @Field({ type: () => L4 }) c!: L4; }
    class L2 { @Field({ type: () => L3 }) c!: L3; }
    class L1 { @Field({ type: () => L2 }) c!: L2; }

    const oas = metaToOAS(L1);
    expect(oas.properties.c.$ref).toBe('#/components/schemas/L2');

    const l2oas = metaToOAS(L2);
    expect(l2oas.properties.c.$ref).toBe('#/components/schemas/L3');
  });

  it('GraphQL generation on deeply nested DTO', () => {
    class G5 { @Field(isString) v!: string; }
    class G4 { @Field({ type: () => G5 }) c!: G5; }
    class G3 { @Field({ type: () => G4 }) c!: G4; }
    class G2 { @Field({ type: () => G3 }) c!: G3; }
    class G1 { @Field({ type: () => G2 }) c!: G2; }

    const gql = metaToGraphQL('G1', G1);
    expect(gql).toContain('c: G2!');
  });

  it('getMeta on circular DTO does not infinite loop', () => {
    class CircA {
      @Field(isString) name!: string;
      @Field({ type: () => CircA, optional: true }) self?: CircA;
    }
    const meta = getMeta(CircA);
    expect(meta['self']!.type!.resolvedClass).toBe(CircA);
  });

  it('OAS + GraphQL on same DTO produce consistent field sets', () => {
    const oas = metaToOAS(FullDto);
    const gql = metaToGraphQL('FullDto', FullDto);
    const oasKeys = Object.keys(oas.properties);
    for (const key of oasKeys) {
      expect(gql).toContain(`${key}:`);
    }
  });
});
