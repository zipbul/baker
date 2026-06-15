import { describe, it, expect, beforeEach, afterEach } from 'bun:test';

import { Baker, Field, isBakerIssueSet } from '../../index';
import { isString, isBoolean, arrayMinSize } from '../../src/rules/index';
import { assertBakerIssueSet } from '../integration/helpers/assert';
import { sealClass } from '../integration/helpers/seal';
import { unseal } from '../integration/helpers/unseal';

const baker = new Baker();

beforeEach(() => baker.seal());
afterEach(() => unseal());

const matchPathCode =
  (path: string, code: string) =>
  (e: { path: string; code: string }): boolean =>
    e.path === path && e.code === code;

// ─────────────────────────────────────────────────────────────────────────────

@baker.Recipe
class AddressDto {
  @Field(isString)
  city!: string;

  @Field(isString)
  street!: string;
}

@baker.Recipe
class UserDto {
  @Field(isString)
  name!: string;

  @Field({ type: () => AddressDto })
  address!: AddressDto;
}

@baker.Recipe
class ItemDto {
  @Field(isString)
  label!: string;
}

@baker.Recipe
class ListDto {
  @Field(arrayMinSize(1), { type: () => [ItemDto] })
  items!: ItemDto[];
}

@baker.Recipe
class DogDto {
  @Field(isString)
  breed!: string;
}

@baker.Recipe
class CatDto {
  @Field(isBoolean)
  indoor!: boolean;
}

@baker.Recipe
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
    const result = (await baker.deserialize(UserDto, {
      name: 'Alice',
      address: { city: 'Seoul', street: '강남대로' },
    })) as UserDto;
    expect(result.name).toBe('Alice');
    expect(result.address).toBeInstanceOf(AddressDto);
    expect(result.address.city).toBe('Seoul');
  });

  it('nested DTO validation failure', async () => {
    expect(isBakerIssueSet(await baker.deserialize(UserDto, { name: 'Alice', address: { city: 123, street: 'ok' } }))).toBe(true);
  });

  it('array nested (each: true)', async () => {
    const result = (await baker.deserialize(ListDto, {
      items: [{ label: 'a' }, { label: 'b' }],
    })) as ListDto;
    expect(result.items).toHaveLength(2);
    expect(result.items[0]!).toBeInstanceOf(ItemDto);
    expect(result.items[0]!.label).toBe('a');
  });

  it('array nested size validation', async () => {
    expect(isBakerIssueSet(await baker.deserialize(ListDto, { items: [] }))).toBe(true);
  });

  it('discriminator deserialization', async () => {
    const dog = (await baker.deserialize(PetOwnerDto, {
      pet: { type: 'dog', breed: 'Shiba' },
    })) as PetOwnerDto;
    expect(dog.pet).toBeInstanceOf(DogDto);
    expect((dog.pet as DogDto).breed).toBe('Shiba');

    const cat = (await baker.deserialize(PetOwnerDto, {
      pet: { type: 'cat', indoor: true },
    })) as PetOwnerDto;
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
    const plain = await baker.serialize(user);
    expect(plain).toEqual({ name: 'Bob', address: { city: 'Tokyo', street: '渋谷' } });
  });
});

// ─── @Nested additional edge cases ───────────────────────────────────────────

describe('@Nested edge cases', () => {
  it('non-object passed to nested DTO → error', async () => {
    const result = await baker.deserialize(UserDto, { name: 'Alice', address: 'not-object' });
    assertBakerIssueSet(result);
    const err = result.errors[0]!;
    expect(err.path).toBe('address');
    expect(err.code).toBe('isObject');
  });

  it('specific element failure in array nested → index in path', async () => {
    const result = await baker.deserialize(ListDto, { items: [{ label: 'ok' }, { label: 123 }, { label: 'fine' }] });
    assertBakerIssueSet(result);
    expect(result.errors.some(matchPathCode('items[1].label', 'isString'))).toBe(true);
  });

  it('@Nested + optional → missing nested field allowed', async () => {
    class OptNested {
      @Field(isString) name!: string;
      @Field({ type: () => AddressDto, optional: true }) address?: AddressDto;
    }
    const optNestedBaker = sealClass(OptNested);
    const r = (await optNestedBaker.deserialize(OptNested, { name: 'Alice' })) as OptNested;
    expect(r.name).toBe('Alice');
    expect(r.address).toBeUndefined();
  });

  it('@Nested + nullable → null nested allowed', async () => {
    class NullNested {
      @Field(isString) name!: string;
      @Field({ type: () => AddressDto, nullable: true }) address!: AddressDto | null;
    }
    const nullNestedBaker = sealClass(NullNested);
    const r = (await nullNestedBaker.deserialize(NullNested, { name: 'Alice', address: null })) as NullNested;
    expect(r.name).toBe('Alice');
    expect(r.address).toBeNull();
  });
});
