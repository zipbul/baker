import { describe, it, expect, afterEach } from 'bun:test';
import { getMeta, Field, SealError } from '../../index';
import { isString, isNumber, isEmail, min, max, minLength } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────
// Basic metadata access
// ─────────────────────────────────────────────────────────────────────────────

describe('getMeta — basic', () => {
  class SimpleDto {
    @Field(isString, minLength(2)) name!: string;
    @Field(isNumber(), min(0), max(150)) age!: number;
    @Field(isString, isEmail()) email!: string;
  }

  it('returns metadata for all fields', () => {
    const meta = getMeta(SimpleDto);
    expect(Object.keys(meta)).toEqual(['name', 'age', 'email']);
  });

  it('field has validation rules with ruleName', () => {
    const meta = getMeta(SimpleDto);
    const names = meta['name']!.validation.map(r => r.rule.ruleName);
    expect(names).toEqual(['isString', 'minLength']);
  });

  it('rule constraints are accessible', () => {
    const meta = getMeta(SimpleDto);
    const minLenRule = meta['name']!.validation.find(r => r.rule.ruleName === 'minLength');
    expect(minLenRule!.rule.constraints).toEqual({ min: 2 });
  });

  it('number rules have correct constraints', () => {
    const meta = getMeta(SimpleDto);
    const rules = meta['age']!.validation;
    expect(rules.map(r => r.rule.ruleName)).toEqual(['isNumber', 'min', 'max']);
    expect(rules.find(r => r.rule.ruleName === 'min')!.rule.constraints).toEqual({ min: 0 });
    expect(rules.find(r => r.rule.ruleName === 'max')!.rule.constraints).toEqual({ max: 150 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Nested type resolution
// ─────────────────────────────────────────────────────────────────────────────

describe('getMeta — nested types', () => {
  class AddressDto {
    @Field(isString) city!: string;
  }

  class UserDto {
    @Field(isString) name!: string;
    @Field({ type: () => AddressDto }) address!: AddressDto;
    @Field({ type: () => [AddressDto] }) addresses!: AddressDto[];
  }

  it('nested DTO has resolvedClass', () => {
    const meta = getMeta(UserDto);
    expect(meta['address']!.type!.resolvedClass).toBe(AddressDto);
  });

  it('array nested DTO has isArray true', () => {
    const meta = getMeta(UserDto);
    expect(meta['addresses']!.type!.isArray).toBe(true);
    expect(meta['addresses']!.type!.resolvedClass).toBe(AddressDto);
  });

  it('non-nested field has type null', () => {
    const meta = getMeta(UserDto);
    expect(meta['name']!.type).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Collections (Map/Set)
// ─────────────────────────────────────────────────────────────────────────────

describe('getMeta — collections', () => {
  class ItemDto {
    @Field(isString) value!: string;
  }

  class CollectionDto {
    @Field({ type: () => Set as any, setValue: () => ItemDto }) items!: Set<ItemDto>;
    @Field({ type: () => Map as any, mapValue: () => ItemDto }) map!: Map<string, ItemDto>;
  }

  it('Set field has collection type', () => {
    const meta = getMeta(CollectionDto);
    expect(meta['items']!.type!.collection).toBe('Set');
  });

  it('Map field has collection type', () => {
    const meta = getMeta(CollectionDto);
    expect(meta['map']!.type!.collection).toBe('Map');
  });

  it('Set with DTO value has resolvedCollectionValue', () => {
    const meta = getMeta(CollectionDto);
    expect(meta['items']!.type!.resolvedCollectionValue).toBe(ItemDto);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Flags (optional, nullable, etc.)
// ─────────────────────────────────────────────────────────────────────────────

describe('getMeta — flags', () => {
  class FlagsDto {
    @Field(isString) required!: string;
    @Field(isString, { optional: true }) optional?: string;
    @Field(isString, { nullable: true }) nullable!: string | null;
    @Field(isString, { optional: true, nullable: true }) both?: string | null;
  }

  it('required field has no optional/nullable flags', () => {
    const flags = getMeta(FlagsDto)['required']!.flags;
    expect(flags.isOptional).toBeUndefined();
    expect(flags.isNullable).toBeUndefined();
  });

  it('optional field has isOptional flag', () => {
    expect(getMeta(FlagsDto)['optional']!.flags.isOptional).toBe(true);
  });

  it('nullable field has isNullable flag', () => {
    expect(getMeta(FlagsDto)['nullable']!.flags.isNullable).toBe(true);
  });

  it('optional + nullable has both flags', () => {
    const flags = getMeta(FlagsDto)['both']!.flags;
    expect(flags.isOptional).toBe(true);
    expect(flags.isNullable).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Expose / Exclude
// ─────────────────────────────────────────────────────────────────────────────

describe('getMeta — expose/exclude', () => {
  class MappedDto {
    @Field(isString, { name: 'user_name' }) name!: string;
    @Field(isString, { exclude: 'serializeOnly' }) password!: string;
    @Field(isString, { groups: ['admin'] }) secret!: string;
  }

  it('expose name mapping is accessible', () => {
    const expose = getMeta(MappedDto)['name']!.expose;
    expect(expose.some(e => e.name === 'user_name')).toBe(true);
  });

  it('exclude direction is accessible', () => {
    const exclude = getMeta(MappedDto)['password']!.exclude;
    expect(exclude).not.toBeNull();
    expect(exclude!.serializeOnly).toBe(true);
  });

  it('groups are accessible', () => {
    const expose = getMeta(MappedDto)['secret']!.expose;
    expect(expose.some(e => e.groups?.includes('admin'))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Discriminator
// ─────────────────────────────────────────────────────────────────────────────

describe('getMeta — discriminator', () => {
  class CatDto { @Field(isString) meow!: string; }
  class DogDto { @Field(isString) bark!: string; }

  class PetOwnerDto {
    @Field({
      type: () => CatDto,
      discriminator: {
        property: 'kind',
        subTypes: [
          { value: CatDto, name: 'cat' },
          { value: DogDto, name: 'dog' },
        ],
      },
    })
    pet!: CatDto | DogDto;
  }

  it('discriminator metadata is accessible', () => {
    const disc = getMeta(PetOwnerDto)['pet']!.type!.discriminator!;
    expect(disc.property).toBe('kind');
    expect(disc.subTypes).toHaveLength(2);
    expect(disc.subTypes[0]!.name).toBe('cat');
    expect(disc.subTypes[1]!.name).toBe('dog');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Inheritance
// ─────────────────────────────────────────────────────────────────────────────

describe('getMeta — inheritance', () => {
  class ParentDto {
    @Field(isString) name!: string;
    @Field(isNumber()) value!: number;
  }

  class ChildDto extends ParentDto {
    @Field(isString) extra!: string;
  }

  it('child includes parent fields', () => {
    const meta = getMeta(ChildDto);
    expect(Object.keys(meta)).toContain('name');
    expect(Object.keys(meta)).toContain('value');
    expect(Object.keys(meta)).toContain('extra');
  });

  it('parent rules are inherited', () => {
    const meta = getMeta(ChildDto);
    expect(meta['name']!.validation.map(r => r.rule.ruleName)).toContain('isString');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Transform
// ─────────────────────────────────────────────────────────────────────────────

describe('getMeta — transforms', () => {
  const trimFn = ({ value }: any) => typeof value === 'string' ? value.trim() : value;

  class TransformDto {
    @Field(isString, { transform: trimFn }) name!: string;
    @Field(isNumber()) age!: number;
  }

  it('field with transform has transform array', () => {
    const meta = getMeta(TransformDto);
    expect(meta['name']!.transform).toHaveLength(1);
  });

  it('field without transform has empty transform array', () => {
    const meta = getMeta(TransformDto);
    expect(meta['age']!.transform).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Error cases
// ─────────────────────────────────────────────────────────────────────────────

describe('getMeta — errors', () => {
  it('class without @Field throws SealError', () => {
    class EmptyDto {}
    expect(() => getMeta(EmptyDto)).toThrow(SealError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Auto-seal behavior
// ─────────────────────────────────────────────────────────────────────────────

describe('getMeta — auto-seal', () => {
  class AutoSealDto {
    @Field(isString) name!: string;
  }

  it('auto-seals on first call', () => {
    const meta = getMeta(AutoSealDto);
    expect(meta['name']).toBeDefined();
  });

  it('returns same metadata on repeated calls', () => {
    const meta1 = getMeta(AutoSealDto);
    const meta2 = getMeta(AutoSealDto);
    expect(meta1).toBe(meta2);
  });
});
