import { describe, it, expect, afterEach } from 'bun:test';
import { getMeta, Field } from '../../index';
import {
  isString, isNumber, isBoolean, isEnum, isArray,
  min, max, minLength, maxLength, length, matches, isIn, isDivisibleBy,
  isEmail, isIP,
  arrayMinSize, arrayMaxSize,
  contains,
} from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────
// 1. OAS 3.1 generation from getMeta
// ─────────────────────────────────────────────────────────────────────────────

describe('getMeta usage — OAS 3.1 generation', () => {
  enum Role { Admin = 'admin', User = 'user' }

  class AddressDto {
    @Field(isString, minLength(1)) street!: string;
    @Field(isString) city!: string;
    @Field(isString, matches(/^\d{5}$/)) zip!: string;
  }

  class TagDto {
    @Field(isString) label!: string;
  }

  class CatDto { @Field(isString) meow!: string; }
  class DogDto { @Field(isString) bark!: string; }

  class ComplexDto {
    @Field(isString, minLength(2), maxLength(100)) name!: string;
    @Field(isNumber(), min(0), max(200)) age!: number;
    @Field(isBoolean) active!: boolean;
    @Field({ type: () => AddressDto }) address!: AddressDto;
    @Field({ type: () => [TagDto] }) tags!: TagDto[];
    @Field(isString, { optional: true }) nickname?: string;
    @Field(isString, { nullable: true }) bio!: string | null;
    @Field({
      type: () => CatDto,
      discriminator: {
        property: 'kind',
        subTypes: [
          { value: CatDto, name: 'cat' },
          { value: DogDto, name: 'dog' },
        ],
      },
    }) pet!: CatDto | DogDto;
    @Field({ type: () => Map as any, mapValue: () => TagDto }) tagMap!: Map<string, TagDto>;
    @Field({ type: () => Set as any, setValue: () => TagDto }) tagSet!: Set<TagDto>;
    @Field(isString, { groups: ['admin'] }) secret!: string;
    @Field(isString, { name: 'user_name' }) userName!: string;
    @Field(isString, { exclude: 'serializeOnly' }) writeOnly!: string;
    @Field(isEnum(Role)) role!: Role;
  }

  it('all fields present in metadata', () => {
    const meta = getMeta(ComplexDto);
    const keys = Object.keys(meta);
    expect(keys).toContain('name');
    expect(keys).toContain('age');
    expect(keys).toContain('active');
    expect(keys).toContain('address');
    expect(keys).toContain('tags');
    expect(keys).toContain('nickname');
    expect(keys).toContain('bio');
    expect(keys).toContain('pet');
    expect(keys).toContain('tagMap');
    expect(keys).toContain('tagSet');
    expect(keys).toContain('secret');
    expect(keys).toContain('userName');
    expect(keys).toContain('writeOnly');
    expect(keys).toContain('role');
  });

  it('string field has type info from requiresType', () => {
    const meta = getMeta(ComplexDto);
    const nameRules = meta['name']!.validation;
    const stringRule = nameRules.find(r => r.rule.ruleName === 'isString');
    expect(stringRule).toBeDefined();
  });

  it('number field constraints: min, max', () => {
    const meta = getMeta(ComplexDto);
    const ageRules = meta['age']!.validation;
    expect(ageRules.find(r => r.rule.ruleName === 'min')!.rule.constraints).toEqual({ min: 0 });
    expect(ageRules.find(r => r.rule.ruleName === 'max')!.rule.constraints).toEqual({ max: 200 });
  });

  it('string field constraints: minLength, maxLength', () => {
    const meta = getMeta(ComplexDto);
    const nameRules = meta['name']!.validation;
    expect(nameRules.find(r => r.rule.ruleName === 'minLength')!.rule.constraints).toEqual({ min: 2 });
    expect(nameRules.find(r => r.rule.ruleName === 'maxLength')!.rule.constraints).toEqual({ max: 100 });
  });

  it('boolean field has isBoolean rule', () => {
    const meta = getMeta(ComplexDto);
    const rules = meta['active']!.validation;
    expect(rules.some(r => r.rule.ruleName === 'isBoolean')).toBe(true);
  });

  it('nested DTO has resolvedClass', () => {
    const meta = getMeta(ComplexDto);
    expect(meta['address']!.type!.resolvedClass).toBe(AddressDto);
  });

  it('array DTO has isArray + resolvedClass', () => {
    const meta = getMeta(ComplexDto);
    expect(meta['tags']!.type!.isArray).toBe(true);
    expect(meta['tags']!.type!.resolvedClass).toBe(TagDto);
  });

  it('optional field has isOptional flag', () => {
    const meta = getMeta(ComplexDto);
    expect(meta['nickname']!.flags.isOptional).toBe(true);
  });

  it('nullable field has isNullable flag', () => {
    const meta = getMeta(ComplexDto);
    expect(meta['bio']!.flags.isNullable).toBe(true);
  });

  it('discriminator metadata complete', () => {
    const meta = getMeta(ComplexDto);
    const disc = meta['pet']!.type!.discriminator!;
    expect(disc.property).toBe('kind');
    expect(disc.subTypes).toHaveLength(2);
    expect(disc.subTypes[0]!.value).toBe(CatDto);
    expect(disc.subTypes[0]!.name).toBe('cat');
    expect(disc.subTypes[1]!.value).toBe(DogDto);
    expect(disc.subTypes[1]!.name).toBe('dog');
  });

  it('Map collection metadata', () => {
    const meta = getMeta(ComplexDto);
    expect(meta['tagMap']!.type!.collection).toBe('Map');
  });

  it('Set collection metadata with resolvedCollectionValue', () => {
    const meta = getMeta(ComplexDto);
    expect(meta['tagSet']!.type!.collection).toBe('Set');
    expect(meta['tagSet']!.type!.resolvedCollectionValue).toBe(TagDto);
  });

  it('groups present in expose', () => {
    const meta = getMeta(ComplexDto);
    expect(meta['secret']!.expose.some(e => e.groups?.includes('admin'))).toBe(true);
  });

  it('name mapping present in expose', () => {
    const meta = getMeta(ComplexDto);
    expect(meta['userName']!.expose.some(e => e.name === 'user_name')).toBe(true);
  });

  it('exclude with direction present', () => {
    const meta = getMeta(ComplexDto);
    expect(meta['writeOnly']!.exclude).not.toBeNull();
    expect(meta['writeOnly']!.exclude!.serializeOnly).toBe(true);
  });

  it('enum rule has values constraint', () => {
    const meta = getMeta(ComplexDto);
    const enumRule = meta['role']!.validation.find(r => r.rule.ruleName === 'isEnum');
    expect(enumRule!.rule.constraints).toEqual({ values: ['admin', 'user'] });
  });

  it('sufficient metadata to build full OAS 3.1 properties object', () => {
    const meta = getMeta(ComplexDto);
    const oasProperties: Record<string, any> = {};
    const required: string[] = [];

    for (const [field, prop] of Object.entries(meta)) {
      const schema: Record<string, any> = {};
      for (const rd of prop.validation) {
        if (rd.rule.ruleName === 'isString') schema.type = 'string';
        if (rd.rule.ruleName === 'isNumber') schema.type = 'number';
        if (rd.rule.ruleName === 'isBoolean') schema.type = 'boolean';
        if (rd.rule.ruleName === 'minLength') schema.minLength = rd.rule.constraints!['min'];
        if (rd.rule.ruleName === 'maxLength') schema.maxLength = rd.rule.constraints!['max'];
        if (rd.rule.ruleName === 'min') schema.minimum = rd.rule.constraints!['min'];
        if (rd.rule.ruleName === 'max') schema.maximum = rd.rule.constraints!['max'];
        if (rd.rule.ruleName === 'isEnum') schema.enum = rd.rule.constraints!['values'];
      }
      if (prop.type?.isArray) schema.type = 'array';
      if (prop.type?.resolvedClass && !prop.type.isArray) schema.$ref = `#/components/schemas/${prop.type.resolvedClass.name}`;
      if (prop.flags.isNullable) schema.nullable = true;
      if (!prop.flags.isOptional) required.push(field);
      oasProperties[field] = schema;
    }

    expect(oasProperties['name']).toMatchObject({ type: 'string', minLength: 2, maxLength: 100 });
    expect(oasProperties['age']).toMatchObject({ type: 'number', minimum: 0, maximum: 200 });
    expect(oasProperties['active']).toMatchObject({ type: 'boolean' });
    expect(oasProperties['address']).toHaveProperty('$ref');
    expect(oasProperties['tags']).toMatchObject({ type: 'array' });
    expect(oasProperties['bio']).toMatchObject({ nullable: true });
    expect(oasProperties['role']).toMatchObject({ enum: ['admin', 'user'] });
    expect(required).toContain('name');
    expect(required).toContain('age');
    expect(required).not.toContain('nickname');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Nested DTO resolution
// ─────────────────────────────────────────────────────────────────────────────

describe('getMeta usage — nested DTO resolution', () => {
  class InnerDto {
    @Field(isString) value!: string;
    @Field(isNumber(), min(1)) count!: number;
  }

  class OuterDto {
    @Field({ type: () => InnerDto }) inner!: InnerDto;
    @Field({ type: () => [InnerDto] }) inners!: InnerDto[];
  }

  it('resolvedClass points to actual class, not undefined', () => {
    const meta = getMeta(OuterDto);
    expect(meta['inner']!.type!.resolvedClass).toBe(InnerDto);
    expect(meta['inner']!.type!.resolvedClass).not.toBeUndefined();
  });

  it('nested DTO own meta accessible via getMeta(resolvedClass)', () => {
    const outerMeta = getMeta(OuterDto);
    const innerClass = outerMeta['inner']!.type!.resolvedClass!;
    const innerMeta = getMeta(innerClass);
    expect(Object.keys(innerMeta)).toEqual(['value', 'count']);
    expect(innerMeta['value']!.validation.some(r => r.rule.ruleName === 'isString')).toBe(true);
    expect(innerMeta['count']!.validation.some(r => r.rule.ruleName === 'min')).toBe(true);
  });

  it('array nested DTO resolvedClass also accessible', () => {
    const meta = getMeta(OuterDto);
    const arrClass = meta['inners']!.type!.resolvedClass!;
    const arrMeta = getMeta(arrClass);
    expect(Object.keys(arrMeta)).toContain('value');
    expect(Object.keys(arrMeta)).toContain('count');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Discriminator metadata
// ─────────────────────────────────────────────────────────────────────────────

describe('getMeta usage — discriminator metadata', () => {
  class CircleDto { @Field(isNumber()) radius!: number; }
  class RectDto { @Field(isNumber()) width!: number; @Field(isNumber()) height!: number; }
  class TriangleDto { @Field(isNumber()) base!: number; }

  class ShapeContainerDto {
    @Field({
      type: () => CircleDto,
      discriminator: {
        property: 'type',
        subTypes: [
          { value: CircleDto, name: 'circle' },
          { value: RectDto, name: 'rect' },
          { value: TriangleDto, name: 'triangle' },
        ],
      },
    }) shape!: CircleDto | RectDto | TriangleDto;
  }

  it('discriminator property name is accessible', () => {
    const disc = getMeta(ShapeContainerDto)['shape']!.type!.discriminator!;
    expect(disc.property).toBe('type');
  });

  it('subTypes value references actual class constructors', () => {
    const disc = getMeta(ShapeContainerDto)['shape']!.type!.discriminator!;
    expect(disc.subTypes[0]!.value).toBe(CircleDto);
    expect(disc.subTypes[1]!.value).toBe(RectDto);
    expect(disc.subTypes[2]!.value).toBe(TriangleDto);
  });

  it('subTypes name strings are accessible', () => {
    const disc = getMeta(ShapeContainerDto)['shape']!.type!.discriminator!;
    expect(disc.subTypes.map(s => s.name)).toEqual(['circle', 'rect', 'triangle']);
  });

  it('each subType class is independently resolvable via getMeta', () => {
    const disc = getMeta(ShapeContainerDto)['shape']!.type!.discriminator!;
    for (const sub of disc.subTypes) {
      const subMeta = getMeta(sub.value as any);
      expect(Object.keys(subMeta).length).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Collection metadata
// ─────────────────────────────────────────────────────────────────────────────

describe('getMeta usage — collection metadata', () => {
  class ElemDto { @Field(isString) val!: string; }

  class CollDto {
    @Field({ type: () => Set as any, setValue: () => ElemDto }) mySet!: Set<ElemDto>;
    @Field({ type: () => Map as any, mapValue: () => ElemDto }) myMap!: Map<string, ElemDto>;
  }

  it('Set has collection=Set and resolvedCollectionValue points to DTO class', () => {
    const meta = getMeta(CollDto);
    const setType = meta['mySet']!.type!;
    expect(setType.collection).toBe('Set');
    expect(setType.resolvedCollectionValue).toBe(ElemDto);
  });

  it('Map has collection=Map', () => {
    const meta = getMeta(CollDto);
    expect(meta['myMap']!.type!.collection).toBe('Map');
  });

  it('Map resolvedCollectionValue points to DTO class', () => {
    const meta = getMeta(CollDto);
    expect(meta['myMap']!.type!.resolvedCollectionValue).toBe(ElemDto);
  });

  it('collection value DTO meta is accessible', () => {
    const meta = getMeta(CollDto);
    const valClass = meta['mySet']!.type!.resolvedCollectionValue!;
    const valMeta = getMeta(valClass);
    expect(Object.keys(valMeta)).toContain('val');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Transform metadata
// ─────────────────────────────────────────────────────────────────────────────

describe('getMeta usage — transform metadata', () => {
  const trimFn = ({ value }: any) => typeof value === 'string' ? value.trim() : value;

  class TransformUsageDto {
    @Field(isString, { transform: trimFn }) trimmed!: string;
    @Field(isString, { transform: trimFn, transformDirection: 'deserializeOnly' }) deserOnly!: string;
    @Field(isString, { transform: trimFn, transformDirection: 'serializeOnly' }) serOnly!: string;
    @Field(isString) noTransform!: string;
  }

  it('transform function is accessible', () => {
    const meta = getMeta(TransformUsageDto);
    expect(meta['trimmed']!.transform).toHaveLength(1);
    expect(typeof meta['trimmed']!.transform[0]!.fn).toBe('function');
  });

  it('deserializeOnly direction option present', () => {
    const meta = getMeta(TransformUsageDto);
    expect(meta['deserOnly']!.transform[0]!.options?.deserializeOnly).toBe(true);
  });

  it('serializeOnly direction option present', () => {
    const meta = getMeta(TransformUsageDto);
    expect(meta['serOnly']!.transform[0]!.options?.serializeOnly).toBe(true);
  });

  it('field without transform has empty transform array', () => {
    const meta = getMeta(TransformUsageDto);
    expect(meta['noTransform']!.transform).toHaveLength(0);
  });

  it('bidirectional transform has no direction options', () => {
    const meta = getMeta(TransformUsageDto);
    expect(meta['trimmed']!.transform[0]!.options).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Expose/Exclude mapping
// ─────────────────────────────────────────────────────────────────────────────

describe('getMeta usage — expose/exclude mapping', () => {
  class MappingDto {
    @Field(isString, { name: 'full_name' }) fullName!: string;
    @Field(isString, { deserializeName: 'input_code' }) code!: string;
    @Field(isString, { serializeName: 'output_label' }) label!: string;
    @Field(isString, { exclude: true }) hidden!: string;
    @Field(isString, { exclude: 'deserializeOnly' }) deserExcluded!: string;
    @Field(isString, { exclude: 'serializeOnly' }) serExcluded!: string;
    @Field(isString, { groups: ['admin', 'superuser'] }) adminField!: string;
  }

  it('bidirectional name mapping', () => {
    const meta = getMeta(MappingDto);
    expect(meta['fullName']!.expose.some(e => e.name === 'full_name')).toBe(true);
  });

  it('deserializeName creates deserializeOnly expose', () => {
    const meta = getMeta(MappingDto);
    const deser = meta['code']!.expose.find(e => e.name === 'input_code');
    expect(deser).toBeDefined();
    expect(deser!.deserializeOnly).toBe(true);
  });

  it('serializeName creates serializeOnly expose', () => {
    const meta = getMeta(MappingDto);
    const ser = meta['label']!.expose.find(e => e.name === 'output_label');
    expect(ser).toBeDefined();
    expect(ser!.serializeOnly).toBe(true);
  });

  it('exclude true is bidirectional', () => {
    const meta = getMeta(MappingDto);
    const excl = meta['hidden']!.exclude;
    expect(excl).not.toBeNull();
    expect(excl!.deserializeOnly).toBeUndefined();
    expect(excl!.serializeOnly).toBeUndefined();
  });

  it('exclude deserializeOnly', () => {
    const meta = getMeta(MappingDto);
    expect(meta['deserExcluded']!.exclude!.deserializeOnly).toBe(true);
  });

  it('exclude serializeOnly', () => {
    const meta = getMeta(MappingDto);
    expect(meta['serExcluded']!.exclude!.serializeOnly).toBe(true);
  });

  it('groups array accessible in expose', () => {
    const meta = getMeta(MappingDto);
    const groups = meta['adminField']!.expose.find(e => e.groups)?.groups;
    expect(groups).toEqual(['admin', 'superuser']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Rule constraints completeness
// ─────────────────────────────────────────────────────────────────────────────

describe('getMeta usage — rule constraints completeness', () => {
  it('min constraint', () => {
    class D { @Field(isNumber(), min(5)) v!: number; }
    const r = getMeta(D)['v']!.validation.find(r => r.rule.ruleName === 'min')!;
    expect(r.rule.constraints).toEqual({ min: 5 });
  });

  it('max constraint', () => {
    class D { @Field(isNumber(), max(99)) v!: number; }
    const r = getMeta(D)['v']!.validation.find(r => r.rule.ruleName === 'max')!;
    expect(r.rule.constraints).toEqual({ max: 99 });
  });

  it('minLength constraint', () => {
    class D { @Field(isString, minLength(3)) v!: string; }
    const r = getMeta(D)['v']!.validation.find(r => r.rule.ruleName === 'minLength')!;
    expect(r.rule.constraints).toEqual({ min: 3 });
  });

  it('maxLength constraint', () => {
    class D { @Field(isString, maxLength(50)) v!: string; }
    const r = getMeta(D)['v']!.validation.find(r => r.rule.ruleName === 'maxLength')!;
    expect(r.rule.constraints).toEqual({ max: 50 });
  });

  it('length constraint', () => {
    class D { @Field(isString, length(2, 10)) v!: string; }
    const r = getMeta(D)['v']!.validation.find(r => r.rule.ruleName === 'length')!;
    expect(r.rule.constraints).toEqual({ min: 2, max: 10 });
  });

  it('matches constraint', () => {
    class D { @Field(isString, matches(/^[A-Z]+$/)) v!: string; }
    const r = getMeta(D)['v']!.validation.find(r => r.rule.ruleName === 'matches')!;
    expect(r.rule.constraints).toEqual({ pattern: '^[A-Z]+$' });
  });

  it('isEnum constraint', () => {
    enum Color { Red = 'red', Blue = 'blue' }
    class D { @Field(isEnum(Color)) v!: Color; }
    const r = getMeta(D)['v']!.validation.find(r => r.rule.ruleName === 'isEnum')!;
    expect(r.rule.constraints).toEqual({ values: ['red', 'blue'] });
  });

  it('isIn constraint', () => {
    class D { @Field(isIn(['a', 'b', 'c'])) v!: string; }
    const r = getMeta(D)['v']!.validation.find(r => r.rule.ruleName === 'isIn')!;
    expect(r.rule.constraints).toEqual({ values: ['a', 'b', 'c'] });
  });

  it('isDivisibleBy constraint', () => {
    class D { @Field(isNumber(), isDivisibleBy(3)) v!: number; }
    const r = getMeta(D)['v']!.validation.find(r => r.rule.ruleName === 'isDivisibleBy')!;
    expect(r.rule.constraints).toEqual({ divisor: 3 });
  });

  it('arrayMinSize constraint', () => {
    class D { @Field(isArray, arrayMinSize(2)) v!: string[]; }
    const r = getMeta(D)['v']!.validation.find(r => r.rule.ruleName === 'arrayMinSize')!;
    expect(r.rule.constraints).toEqual({ min: 2 });
  });

  it('arrayMaxSize constraint', () => {
    class D { @Field(isArray, arrayMaxSize(10)) v!: string[]; }
    const r = getMeta(D)['v']!.validation.find(r => r.rule.ruleName === 'arrayMaxSize')!;
    expect(r.rule.constraints).toEqual({ max: 10 });
  });

  it('isIP constraint', () => {
    class D { @Field(isIP(4)) v!: string; }
    const r = getMeta(D)['v']!.validation.find(r => r.rule.ruleName === 'isIP')!;
    expect(r.rule.constraints).toEqual({ version: 4 });
  });

  it('isIP without version has undefined version', () => {
    class D { @Field(isIP()) v!: string; }
    const r = getMeta(D)['v']!.validation.find(r => r.rule.ruleName === 'isIP')!;
    expect(r.rule.constraints).toEqual({ version: undefined });
  });

  it('contains constraint', () => {
    class D { @Field(isString, contains('foo')) v!: string; }
    const r = getMeta(D)['v']!.validation.find(r => r.rule.ruleName === 'contains')!;
    expect(r.rule.constraints).toEqual({ seed: 'foo' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Inheritance
// ─────────────────────────────────────────────────────────────────────────────

describe('getMeta usage — inheritance', () => {
  class BaseDto {
    @Field(isString, minLength(1)) id!: string;
    @Field(isNumber(), min(0)) version!: number;
  }

  class ExtendedDto extends BaseDto {
    @Field(isString, isEmail()) email!: string;
    @Field(isBoolean) active!: boolean;
  }

  class DoubleExtendedDto extends ExtendedDto {
    @Field(isString) extra!: string;
  }

  it('child getMeta includes parent fields', () => {
    const meta = getMeta(ExtendedDto);
    expect(Object.keys(meta)).toContain('id');
    expect(Object.keys(meta)).toContain('version');
    expect(Object.keys(meta)).toContain('email');
    expect(Object.keys(meta)).toContain('active');
  });

  it('parent rules are merged into child', () => {
    const meta = getMeta(ExtendedDto);
    const idRules = meta['id']!.validation.map(r => r.rule.ruleName);
    expect(idRules).toContain('isString');
    expect(idRules).toContain('minLength');
  });

  it('parent constraints preserved in child', () => {
    const meta = getMeta(ExtendedDto);
    const minRule = meta['version']!.validation.find(r => r.rule.ruleName === 'min')!;
    expect(minRule.rule.constraints).toEqual({ min: 0 });
  });

  it('double inheritance includes all ancestor fields', () => {
    const meta = getMeta(DoubleExtendedDto);
    expect(Object.keys(meta)).toContain('id');
    expect(Object.keys(meta)).toContain('version');
    expect(Object.keys(meta)).toContain('email');
    expect(Object.keys(meta)).toContain('active');
    expect(Object.keys(meta)).toContain('extra');
  });

  it('child-only fields not in parent meta', () => {
    const meta = getMeta(BaseDto);
    expect(Object.keys(meta)).not.toContain('email');
    expect(Object.keys(meta)).not.toContain('active');
  });
});
