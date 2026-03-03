import { describe, it, expect, afterEach } from 'bun:test';
import {
  seal, deserialize, serialize, BakerValidationError,
  Type, ValidateNested, IsString, IsNumber,
} from '../../index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class Address {
  @IsString() city!: string;
}

class TypeDto {
  @Type(() => Address)
  @ValidateNested()
  address!: Address;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('@Type', () => {
  it('중첩 객체를 인스턴스로 변환', async () => {
    seal();
    const r = await deserialize<TypeDto>(TypeDto, { address: { city: 'Seoul' } });
    expect(r.address).toBeInstanceOf(Address);
    expect(r.address.city).toBe('Seoul');
  });

  it('중첩 검증 실패', async () => {
    seal();
    await expect(
      deserialize(TypeDto, { address: { city: 123 } }),
    ).rejects.toThrow(BakerValidationError);
  });

  it('discriminator 다형성', async () => {
    class Cat {
      @IsString() name!: string;
    }
    class Dog {
      @IsString() name!: string;
      @IsNumber() age!: number;
    }

    class PetDto {
      @Type(() => Object, {
        discriminator: { property: 'type', subTypes: [
          { value: Cat, name: 'cat' },
          { value: Dog, name: 'dog' },
        ] },
        keepDiscriminatorProperty: true,
      })
      @ValidateNested()
      pet!: Cat | Dog;
    }

    seal();

    const catResult = await deserialize<PetDto>(PetDto, { pet: { type: 'cat', name: 'Whiskers' } });
    expect(catResult.pet).toBeInstanceOf(Cat);
    expect(catResult.pet.name).toBe('Whiskers');

    const dogResult = await deserialize<PetDto>(PetDto, { pet: { type: 'dog', name: 'Buddy', age: 3 } });
    expect(dogResult.pet).toBeInstanceOf(Dog);
    expect((dogResult.pet as Dog).age).toBe(3);
  });

  it('serialize 시 중첩 객체 직렬화', async () => {
    seal();
    const r = await deserialize<TypeDto>(TypeDto, { address: { city: 'Seoul' } });
    const s = await serialize(r);
    expect(s).toEqual({ address: { city: 'Seoul' } });
  });
});
