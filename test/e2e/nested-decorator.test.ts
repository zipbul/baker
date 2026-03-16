import { describe, it, expect } from 'bun:test';
import { deserialize, serialize, Field, toJsonSchema, BakerValidationError } from '../../index';
import { isString, isBoolean, arrayMinSize } from '../../src/rules/index';
// ─────────────────────────────────────────────────────────────────────────────

class AddressDto {
  @Field(isString)
  city!: string;

  @Field(isString)
  street!: string;
}

class UserDto {
  @Field(isString)
  name!: string;

  @Field({ type: () => AddressDto })
  address!: AddressDto;
}

class ItemDto {
  @Field(isString)
  label!: string;
}

class ListDto {
  @Field(arrayMinSize(1), { type: () => [ItemDto] })
  items!: ItemDto[];
}

class DogDto {
  @Field(isString)
  breed!: string;
}

class CatDto {
  @Field(isBoolean)
  indoor!: boolean;
}

class PetOwnerDto {
  @Field({
    type: () => DogDto,
    discriminator: {
      property: 'type',
      subTypes: [
        { value: DogDto, name: 'dog' },
        { value: CatDto, name: 'cat' },
      ],
    },
  })
  pet!: DogDto | CatDto;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('@Nested deserialization', () => {
  it('simple nested DTO', async () => {
    const result = await deserialize<UserDto>(UserDto, {
      name: 'Alice',
      address: { city: 'Seoul', street: '강남대로' },
    });
    expect(result.name).toBe('Alice');
    expect(result.address).toBeInstanceOf(AddressDto);
    expect(result.address.city).toBe('Seoul');
  });

  it('nested DTO validation failure', async () => {
    await expect(
      deserialize(UserDto, { name: 'Alice', address: { city: 123, street: 'ok' } }),
    ).rejects.toThrow();
  });

  it('array nested (each: true)', async () => {
    const result = await deserialize<ListDto>(ListDto, {
      items: [{ label: 'a' }, { label: 'b' }],
    });
    expect(result.items).toHaveLength(2);
    expect(result.items[0]!).toBeInstanceOf(ItemDto);
    expect(result.items[0]!.label).toBe('a');
  });

  it('array nested size validation', async () => {
    await expect(deserialize(ListDto, { items: [] })).rejects.toThrow();
  });

  it('discriminator deserialization', async () => {
    const dog = await deserialize<PetOwnerDto>(PetOwnerDto, {
      pet: { type: 'dog', breed: 'Shiba' },
    });
    expect(dog.pet).toBeInstanceOf(DogDto);
    expect((dog.pet as DogDto).breed).toBe('Shiba');

    const cat = await deserialize<PetOwnerDto>(PetOwnerDto, {
      pet: { type: 'cat', indoor: true },
    });
    expect(cat.pet).toBeInstanceOf(CatDto);
    expect((cat.pet as CatDto).indoor).toBe(true);
  });
});

describe('@Nested serialization', () => {
  it('nested DTO serialization', async () => {
    const user = new UserDto();
    user.name = 'Bob';
    user.address = new AddressDto();
    user.address.city = 'Tokyo';
    user.address.street = '渋谷';
    const plain = await serialize(user);
    expect(plain).toEqual({ name: 'Bob', address: { city: 'Tokyo', street: '渋谷' } });
  });
});

describe('@Nested toJsonSchema', () => {
  it('simple $ref', () => {
    const schema = toJsonSchema(UserDto);
    expect(schema.properties!.address).toEqual({ $ref: '#/$defs/AddressDto' });
    expect(schema.$defs!.AddressDto!.type).toBe('object');
    expect(schema.$defs!.AddressDto!.properties!.city).toEqual({ type: 'string' });
  });

  it('each → type: "array", items: { $ref }', () => {
    const schema = toJsonSchema(ListDto);
    expect(schema.properties!.items!.type).toBe('array');
    expect(schema.properties!.items!.items).toEqual({ $ref: '#/$defs/ItemDto' });
    expect(schema.properties!.items!.minItems).toBe(1);
  });

  it('discriminator → oneOf + const', () => {
    const schema = toJsonSchema(PetOwnerDto);
    const pet = schema.properties!.pet!;
    expect(pet.oneOf).toHaveLength(2);
    expect(pet.oneOf![0]!).toEqual({
      allOf: [
        { $ref: '#/$defs/DogDto' },
        { properties: { type: { const: 'dog' } }, required: ['type'] },
      ],
    });
    expect(pet.oneOf![1]!).toEqual({
      allOf: [
        { $ref: '#/$defs/CatDto' },
        { properties: { type: { const: 'cat' } }, required: ['type'] },
      ],
    });
  });
});

// ─── @Nested additional edge cases ───────────────────────────────────────────

describe('@Nested edge cases', () => {
  it('non-object passed to nested DTO → error', async () => {
    try {
      await deserialize(UserDto, { name: 'Alice', address: 'not-object' });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BakerValidationError);
      const err = (e as BakerValidationError).errors[0]!;
      expect(err.path).toBe('address');
      expect(err.code).toBe('isObject');
    }
  });

  it('specific element failure in array nested → index in path', async () => {
    try {
      await deserialize(ListDto, { items: [{ label: 'ok' }, { label: 123 }, { label: 'fine' }] });
      expect.unreachable();
    } catch (e) {
      const errors = (e as BakerValidationError).errors;
      expect(errors.some(err => err.path === 'items[1].label' && err.code === 'isString')).toBe(true);
    }
  });

  it('@Nested + optional → missing nested field allowed', async () => {
    class OptNested {
      @Field(isString) name!: string;
      @Field({ type: () => AddressDto, optional: true }) address?: AddressDto;
    }
    const r = await deserialize<OptNested>(OptNested, { name: 'Alice' });
    expect(r.name).toBe('Alice');
    expect(r.address).toBeUndefined();
  });

  it('@Nested + nullable → null nested allowed', async () => {
    class NullNested {
      @Field(isString) name!: string;
      @Field({ type: () => AddressDto, nullable: true }) address!: AddressDto | null;
    }
    const r = await deserialize<NullNested>(NullNested, { name: 'Alice', address: null });
    expect(r.name).toBe('Alice');
    expect(r.address).toBeNull();
  });
});
