import { describe, it, expect, afterEach } from 'bun:test';
import { seal, deserialize, serialize, IsString, IsNumber, IsBoolean, ArrayMinSize, Nested, IsOptional, IsNullable, toJsonSchema, BakerValidationError } from '../../index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class AddressDto {
  @IsString()
  city!: string;

  @IsString()
  street!: string;
}

class UserDto {
  @IsString()
  name!: string;

  @Nested(() => AddressDto)
  address!: AddressDto;
}

class ItemDto {
  @IsString()
  label!: string;
}

class ListDto {
  @Nested(() => ItemDto, { each: true })
  @ArrayMinSize(1)
  items!: ItemDto[];
}

class DogDto {
  @IsString()
  breed!: string;
}

class CatDto {
  @IsBoolean()
  indoor!: boolean;
}

class PetOwnerDto {
  @Nested(() => DogDto, {
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

describe('@Nested 역직렬화', () => {
  it('단순 중첩 DTO', async () => {
    seal();
    const result = await deserialize<UserDto>(UserDto, {
      name: 'Alice',
      address: { city: 'Seoul', street: '강남대로' },
    });
    expect(result.name).toBe('Alice');
    expect(result.address).toBeInstanceOf(AddressDto);
    expect(result.address.city).toBe('Seoul');
  });

  it('중첩 DTO 검증 실패', async () => {
    seal();
    await expect(
      deserialize(UserDto, { name: 'Alice', address: { city: 123, street: 'ok' } }),
    ).rejects.toThrow();
  });

  it('배열 중첩 (each: true)', async () => {
    seal();
    const result = await deserialize<ListDto>(ListDto, {
      items: [{ label: 'a' }, { label: 'b' }],
    });
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toBeInstanceOf(ItemDto);
    expect(result.items[0].label).toBe('a');
  });

  it('배열 중첩 크기 검증', async () => {
    seal();
    await expect(deserialize(ListDto, { items: [] })).rejects.toThrow();
  });

  it('discriminator 역직렬화', async () => {
    seal();
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

describe('@Nested 직렬화', () => {
  it('중첩 DTO 직렬화', async () => {
    seal();
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
  it('단순 $ref', () => {
    const schema = toJsonSchema(UserDto);
    expect(schema.properties!.address).toEqual({ $ref: '#/$defs/AddressDto' });
    expect(schema.$defs!.AddressDto.type).toBe('object');
    expect(schema.$defs!.AddressDto.properties!.city).toEqual({ type: 'string' });
  });

  it('each → type: "array", items: { $ref }', () => {
    const schema = toJsonSchema(ListDto);
    expect(schema.properties!.items.type).toBe('array');
    expect(schema.properties!.items.items).toEqual({ $ref: '#/$defs/ItemDto' });
    expect(schema.properties!.items.minItems).toBe(1);
  });

  it('discriminator → oneOf + const', () => {
    const schema = toJsonSchema(PetOwnerDto);
    const pet = schema.properties!.pet;
    expect(pet.oneOf).toHaveLength(2);
    expect(pet.oneOf![0]).toEqual({
      $ref: '#/$defs/DogDto',
      properties: { type: { const: 'dog' } },
      required: ['type'],
    });
    expect(pet.oneOf![1]).toEqual({
      $ref: '#/$defs/CatDto',
      properties: { type: { const: 'cat' } },
      required: ['type'],
    });
  });
});

// ─── @Nested 추가 에지 케이스 ───────────────────────────────────────────────

describe('@Nested 에지 케이스', () => {
  it('중첩 DTO에 비-객체 전달 시 에러', async () => {
    seal();
    try {
      await deserialize(UserDto, { name: 'Alice', address: 'not-object' });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BakerValidationError);
      const err = (e as BakerValidationError).errors[0];
      expect(err.path).toBe('address');
      expect(err.code).toBe('isObject');
    }
  });

  it('배열 중첩에서 특정 원소 실패 시 인덱스 경로', async () => {
    seal();
    try {
      await deserialize(ListDto, { items: [{ label: 'ok' }, { label: 123 }, { label: 'fine' }] });
      expect.unreachable();
    } catch (e) {
      const errors = (e as BakerValidationError).errors;
      expect(errors.some(err => err.path === 'items[1].label' && err.code === 'isString')).toBe(true);
    }
  });

  it('@Nested + @IsOptional → 중첩 필드 누락 허용', async () => {
    class OptNested {
      @IsString() name!: string;
      @IsOptional() @Nested(() => AddressDto) address?: AddressDto;
    }
    seal();
    const r = await deserialize<OptNested>(OptNested, { name: 'Alice' });
    expect(r.name).toBe('Alice');
    expect(r.address).toBeUndefined();
  });

  it('@Nested + @IsNullable → null 중첩 허용', async () => {
    class NullNested {
      @IsString() name!: string;
      @IsNullable() @Nested(() => AddressDto) address!: AddressDto | null;
    }
    seal();
    const r = await deserialize<NullNested>(NullNested, { name: 'Alice', address: null });
    expect(r.name).toBe('Alice');
    expect(r.address).toBeNull();
  });
});
