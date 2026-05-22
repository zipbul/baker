import { describe, it, expect, beforeEach, afterEach } from 'bun:test';

import { deserialize, serialize, isBakerError, Field, Recipe, seal } from '../../index';
import { isString, isNumber } from '../../src/rules/index';
import { sealClass } from '../integration/helpers/seal';
import { unseal } from '../integration/helpers/unseal';

beforeEach(() => {
  unseal();
  seal();
});
beforeEach(() => seal());
afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

@Recipe
class Address {
  @Field(isString) city!: string;
}

@Recipe
class TypeDto {
  @Field({ type: () => Address })
  address!: Address;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('@Type / @Field({ type })', () => {
  it('converts nested object to instance', async () => {
    const r = (await deserialize(TypeDto, { address: { city: 'Seoul' } })) as TypeDto;
    expect(r.address).toBeInstanceOf(Address);
    expect(r.address.city).toBe('Seoul');
  });

  it('nested validation failure', async () => {
    expect(isBakerError(await deserialize(TypeDto, { address: { city: 123 } }))).toBe(true);
  });

  it('discriminator polymorphism', async () => {
    @Recipe
    class Cat {
      @Field(isString) name!: string;
    }
    sealClass(Cat);
    @Recipe
    class Dog {
      @Field(isString) name!: string;
      @Field(isNumber()) age!: number;
    }
    sealClass(Dog);

    @Recipe
    class PetDto {
      @Field({
        type: () => Object,
        discriminator: {
          property: 'type',
          subTypes: [
            { value: Cat, name: 'cat' },
            { value: Dog, name: 'dog' },
          ],
        },
        keepDiscriminatorProperty: true,
      })
      pet!: Cat | Dog;
    }
    sealClass(PetDto);

    const catResult = (await deserialize(PetDto, { pet: { type: 'cat', name: 'Whiskers' } })) as PetDto;
    expect(catResult.pet).toBeInstanceOf(Cat);
    expect(catResult.pet.name).toBe('Whiskers');

    const dogResult = (await deserialize(PetDto, { pet: { type: 'dog', name: 'Buddy', age: 3 } })) as PetDto;
    expect(dogResult.pet).toBeInstanceOf(Dog);
    expect((dogResult.pet as Dog).age).toBe(3);
  });

  it('serializes nested object on serialize', async () => {
    const r = (await deserialize(TypeDto, { address: { city: 'Seoul' } })) as TypeDto;
    const s = await serialize(r);
    expect(s).toEqual({ address: { city: 'Seoul' } });
  });
});
