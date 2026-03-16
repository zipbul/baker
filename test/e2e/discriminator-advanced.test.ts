import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Field, deserialize, serialize, BakerValidationError, toJsonSchema } from '../../index';
import { isString, isBoolean } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

beforeEach(() => unseal());
afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class DogDto {
  @Field(isString)
  breed!: string;
}

class CatDto {
  @Field(isBoolean)
  indoor!: boolean;
}

class OwnerDto {
  @Field(isString)
  name!: string;

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

class OwnerKeepDiscDto {
  @Field({
    type: () => DogDto,
    discriminator: {
      property: 'kind',
      subTypes: [
        { value: DogDto, name: 'dog' },
        { value: CatDto, name: 'cat' },
      ],
    },
    keepDiscriminatorProperty: true,
  })
  pet!: (DogDto | CatDto) & { kind: string };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('discriminator — invalidDiscriminator', () => {
  it('존재하지 않는 subType → invalidDiscriminator 에러', async () => {
    try {
      await deserialize(OwnerDto, {
        name: 'Alice',
        pet: { type: 'fish', scales: true },
      });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BakerValidationError);
      const err = (e as BakerValidationError).errors.find(e => e.code === 'invalidDiscriminator');
      expect(err).toBeDefined();
    }
  });

  it('discriminator 프로퍼티 누락 → 에러', async () => {
    await expect(
      deserialize(OwnerDto, { name: 'Bob', pet: { breed: 'Shiba' } }),
    ).rejects.toThrow(BakerValidationError);
  });
});

describe('discriminator — keepDiscriminatorProperty', () => {
  it('keepDiscriminatorProperty: true → 결과에 discriminator 필드 유지', async () => {
    const result = await deserialize<OwnerKeepDiscDto>(OwnerKeepDiscDto, {
      pet: { kind: 'dog', breed: 'Poodle' },
    });
    expect(result.pet).toBeInstanceOf(DogDto);
    expect((result.pet as DogDto).breed).toBe('Poodle');
    expect((result.pet as any).kind).toBe('dog');
  });

  it('keepDiscriminatorProperty 미설정 → 결과에 discriminator 필드 없음', async () => {
    const result = await deserialize<OwnerDto>(OwnerDto, {
      name: 'Carol',
      pet: { type: 'cat', indoor: true },
    });
    expect((result.pet as any).type).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// discriminator serialize — single & array (covers serialize-builder C-8 instanceof chain)
// ─────────────────────────────────────────────────────────────────────────────

class OwnerArrayDto {
  @Field(isString)
  name!: string;

  @Field({
    type: () => [DogDto],
    discriminator: {
      property: 'type',
      subTypes: [
        { value: DogDto, name: 'dog' },
        { value: CatDto, name: 'cat' },
      ],
    },
  })
  pets!: (DogDto | CatDto)[];
}

describe('discriminator — serialize', () => {
  it('should serialize single discriminator field with instanceof dispatch', async () => {
    const dog = Object.assign(new DogDto(), { breed: 'Shiba' });
    const owner = Object.assign(new OwnerDto(), { name: 'Alice', pet: dog });
    const result = await serialize(owner);
    expect(result.pet).toEqual({ breed: 'Shiba', type: 'dog' });
  });

  it('should serialize array discriminator field with instanceof dispatch', async () => {
    const dog = Object.assign(new DogDto(), { breed: 'Poodle' });
    const cat = Object.assign(new CatDto(), { indoor: true });
    const owner = Object.assign(new OwnerArrayDto(), { name: 'Bob', pets: [dog, cat] });
    const result = await serialize(owner);
    expect(result.pets).toEqual([
      { breed: 'Poodle', type: 'dog' },
      { indoor: true, type: 'cat' },
    ]);
  });
});

describe('discriminator — toJsonSchema', () => {
  it('oneOf + const 매핑', () => {
    const schema = toJsonSchema(OwnerDto);
    const pet = schema.properties!.pet;
    expect(pet!.oneOf).toHaveLength(2);
    expect(pet!.oneOf![0]).toEqual({
      allOf: [
        { $ref: '#/$defs/DogDto' },
        { properties: { type: { const: 'dog' } }, required: ['type'] },
      ],
    });
  });
});
