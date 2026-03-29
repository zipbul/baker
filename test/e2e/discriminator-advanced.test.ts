import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Field, deserialize, serialize, isBakerError, toJsonSchema } from '../../index';
import type { BakerErrors } from '../../index';
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
  it('non-existent subType → invalidDiscriminator error', async () => {
    const result = await deserialize(OwnerDto, {
      name: 'Alice',
      pet: { type: 'fish', scales: true },
    });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      const err = result.errors.find(e => e.code === 'invalidDiscriminator');
      expect(err).toBeDefined();
    }
  });

  it('discriminator property missing → error', async () => {
    expect(isBakerError(await deserialize(OwnerDto, { name: 'Bob', pet: { breed: 'Shiba' } }))).toBe(true);
  });
});

describe('discriminator — keepDiscriminatorProperty', () => {
  it('keepDiscriminatorProperty: true → discriminator field retained in result', async () => {
    const result = await deserialize(OwnerKeepDiscDto, {
      pet: { kind: 'dog', breed: 'Poodle' },
    }) as OwnerKeepDiscDto;
    expect(result.pet).toBeInstanceOf(DogDto);
    expect((result.pet as DogDto).breed).toBe('Poodle');
    expect((result.pet as any).kind).toBe('dog');
  });

  it('keepDiscriminatorProperty not set → discriminator field absent from result', async () => {
    const result = await deserialize(OwnerDto, {
      name: 'Carol',
      pet: { type: 'cat', indoor: true },
    }) as OwnerDto;
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
  it('oneOf + const mapping', () => {
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

// ─── E-23: 2 discriminator fields in same DTO ──────────────────────────────

describe('E-23: 2 discriminator fields in same DTO', () => {
  class CreditCardPayment {
    @Field(isString)
    cardNumber!: string;
  }

  class BankTransferPayment {
    @Field(isString)
    bankCode!: string;
  }

  class DomesticAddress {
    @Field(isString)
    city!: string;
  }

  class InternationalAddress {
    @Field(isString)
    country!: string;
  }

  class OrderDto {
    @Field(isString)
    orderId!: string;

    @Field({
      type: () => CreditCardPayment,
      discriminator: {
        property: 'type',
        subTypes: [
          { value: CreditCardPayment, name: 'creditcard' },
          { value: BankTransferPayment, name: 'bank' },
        ],
      },
    })
    payment!: CreditCardPayment | BankTransferPayment;

    @Field({
      type: () => DomesticAddress,
      discriminator: {
        property: 'kind',
        subTypes: [
          { value: DomesticAddress, name: 'domestic' },
          { value: InternationalAddress, name: 'international' },
        ],
      },
    })
    address!: DomesticAddress | InternationalAddress;
  }

  it('both discriminator fields deserialize correctly', async () => {
    const r = await deserialize(OrderDto, {
      orderId: 'ORD-1',
      payment: { type: 'creditcard', cardNumber: '4111111111111111' },
      address: { kind: 'domestic', city: 'Seoul' },
    }) as OrderDto;
    expect(r.payment).toBeInstanceOf(CreditCardPayment);
    expect((r.payment as CreditCardPayment).cardNumber).toBe('4111111111111111');
    expect(r.address).toBeInstanceOf(DomesticAddress);
    expect((r.address as DomesticAddress).city).toBe('Seoul');
  });

  it('second combination: bank + international', async () => {
    const r = await deserialize(OrderDto, {
      orderId: 'ORD-2',
      payment: { type: 'bank', bankCode: 'SWIFT123' },
      address: { kind: 'international', country: 'US' },
    }) as OrderDto;
    expect(r.payment).toBeInstanceOf(BankTransferPayment);
    expect(r.address).toBeInstanceOf(InternationalAddress);
  });

  it('payment invalid discriminator → error path on payment', async () => {
    const result = await deserialize(OrderDto, {
      orderId: 'ORD-3',
      payment: { type: 'crypto', hash: 'abc' },
      address: { kind: 'domestic', city: 'Seoul' },
    });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      const err = result.errors.find(x => x.code === 'invalidDiscriminator');
      expect(err).toBeDefined();
      expect(err!.path).toContain('payment');
    }
  });

  it('address invalid discriminator → error path on address', async () => {
    const result = await deserialize(OrderDto, {
      orderId: 'ORD-4',
      payment: { type: 'creditcard', cardNumber: '4111111111111111' },
      address: { kind: 'alien', planet: 'Mars' },
    });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      const err = result.errors.find(x => x.code === 'invalidDiscriminator');
      expect(err).toBeDefined();
      expect(err!.path).toContain('address');
    }
  });
});
