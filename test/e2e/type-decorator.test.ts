import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { deserialize, serialize, BakerValidationError, Field, Type } from '../../index';
import { isString, isNumber } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

beforeEach(() => unseal());
afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class Address {
  @Field(isString) city!: string;
}

class TypeDto {
  @Field({ type: () => Address })
  address!: Address;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('@Type / @Field({ type })', () => {
  it('중첩 객체를 인스턴스로 변환', async () => {
    const r = await deserialize<TypeDto>(TypeDto, { address: { city: 'Seoul' } });
    expect(r.address).toBeInstanceOf(Address);
    expect(r.address.city).toBe('Seoul');
  });

  it('중첩 검증 실패', async () => {
    await expect(
      deserialize(TypeDto, { address: { city: 123 } }),
    ).rejects.toThrow(BakerValidationError);
  });

  it('discriminator 다형성', async () => {
    class Cat {
      @Field(isString) name!: string;
    }
    class Dog {
      @Field(isString) name!: string;
      @Field(isNumber()) age!: number;
    }

    class PetDto {
      @Type(() => Object, {
        discriminator: { property: 'type', subTypes: [
          { value: Cat, name: 'cat' },
          { value: Dog, name: 'dog' },
        ] },
        keepDiscriminatorProperty: true,
      })
      pet!: Cat | Dog;
    }

    const catResult = await deserialize<PetDto>(PetDto, { pet: { type: 'cat', name: 'Whiskers' } });
    expect(catResult.pet).toBeInstanceOf(Cat);
    expect(catResult.pet.name).toBe('Whiskers');

    const dogResult = await deserialize<PetDto>(PetDto, { pet: { type: 'dog', name: 'Buddy', age: 3 } });
    expect(dogResult.pet).toBeInstanceOf(Dog);
    expect((dogResult.pet as Dog).age).toBe(3);
  });

  it('serialize 시 중첩 객체 직렬화', async () => {
    const r = await deserialize<TypeDto>(TypeDto, { address: { city: 'Seoul' } });
    const s = await serialize(r);
    expect(s).toEqual({ address: { city: 'Seoul' } });
  });
});
