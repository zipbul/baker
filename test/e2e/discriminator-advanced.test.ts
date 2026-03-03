import { describe, it, expect, afterEach } from 'bun:test';
import { seal, deserialize, serialize, BakerValidationError, IsString, IsNumber, IsBoolean, Nested, toJsonSchema } from '../../index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class DogDto {
  @IsString()
  breed!: string;
}

class CatDto {
  @IsBoolean()
  indoor!: boolean;
}

class OwnerDto {
  @IsString()
  name!: string;

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

class OwnerKeepDiscDto {
  @Nested(() => DogDto, {
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
    seal();
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
    seal();
    await expect(
      deserialize(OwnerDto, { name: 'Bob', pet: { breed: 'Shiba' } }),
    ).rejects.toThrow(BakerValidationError);
  });
});

describe('discriminator — keepDiscriminatorProperty', () => {
  it('keepDiscriminatorProperty: true → 결과에 discriminator 필드 유지', async () => {
    seal();
    const result = await deserialize<OwnerKeepDiscDto>(OwnerKeepDiscDto, {
      pet: { kind: 'dog', breed: 'Poodle' },
    });
    expect(result.pet).toBeInstanceOf(DogDto);
    expect((result.pet as DogDto).breed).toBe('Poodle');
    expect((result.pet as any).kind).toBe('dog');
  });

  it('keepDiscriminatorProperty 미설정 → 결과에 discriminator 필드 없음', async () => {
    seal();
    const result = await deserialize<OwnerDto>(OwnerDto, {
      name: 'Carol',
      pet: { type: 'cat', indoor: true },
    });
    expect((result.pet as any).type).toBeUndefined();
  });
});

describe('discriminator — toJsonSchema', () => {
  it('oneOf + const 매핑', () => {
    const schema = toJsonSchema(OwnerDto);
    const pet = schema.properties!.pet;
    expect(pet!.oneOf).toHaveLength(2);
    expect(pet!.oneOf![0]).toEqual({
      $ref: '#/$defs/DogDto',
      properties: { type: { const: 'dog' } },
      required: ['type'],
    });
  });
});
