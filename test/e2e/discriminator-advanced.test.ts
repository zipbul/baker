import { describe, it, expect } from 'bun:test';

import { Baker, Field, isBakerIssueSet } from '../../index';
import { isString, isBoolean } from '../../src/rules/index';
import { assertBakerIssueSet } from '../integration/helpers/assert';

const baker = new Baker();

// ─────────────────────────────────────────────────────────────────────────────

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

@baker.Recipe
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
    const result = await baker.deserialize(OwnerDto, {
      name: 'Alice',
      pet: { type: 'fish', scales: true },
    });
    assertBakerIssueSet(result);
    const err = result.errors.find(e => e.code === 'invalidDiscriminator');
    expect(err).toBeDefined();
  });

  it('discriminator property missing → error', async () => {
    expect(isBakerIssueSet(await baker.deserialize(OwnerDto, { name: 'Bob', pet: { breed: 'Shiba' } }))).toBe(true);
  });
});

describe('discriminator — keepDiscriminatorProperty', () => {
  it('keepDiscriminatorProperty: true → discriminator field retained in result', async () => {
    const result = (await baker.deserialize(OwnerKeepDiscDto, {
      pet: { kind: 'dog', breed: 'Poodle' },
    })) as OwnerKeepDiscDto;
    expect(result.pet).toBeInstanceOf(DogDto);
    expect((result.pet as DogDto).breed).toBe('Poodle');
    expect((result.pet as DogDto & { kind?: string }).kind).toBe('dog');
  });

  it('keepDiscriminatorProperty not set → discriminator field absent from result', async () => {
    const result = (await baker.deserialize(OwnerDto, {
      name: 'Carol',
      pet: { type: 'cat', indoor: true },
    })) as OwnerDto;
    expect((result.pet as object & { type?: unknown }).type).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// discriminator serialize — single & array (covers serialize-builder C-8 instanceof chain)
// ─────────────────────────────────────────────────────────────────────────────

@baker.Recipe
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
    const result = await baker.serialize(owner);
    expect(result.pet).toEqual({ breed: 'Shiba', type: 'dog' });
  });

  it('should serialize array discriminator field with instanceof dispatch', async () => {
    const dog = Object.assign(new DogDto(), { breed: 'Poodle' });
    const cat = Object.assign(new CatDto(), { indoor: true });
    const owner = Object.assign(new OwnerArrayDto(), { name: 'Bob', pets: [dog, cat] });
    const result = await baker.serialize(owner);
    expect(result.pets).toEqual([
      { breed: 'Poodle', type: 'dog' },
      { indoor: true, type: 'cat' },
    ]);
  });
});

// ─── E-23: 2 discriminator fields in same DTO ──────────────────────────────

describe('E-23: 2 discriminator fields in same DTO', () => {
  const e23 = new Baker();

  @e23.Recipe
  class CreditCardPayment {
    @Field(isString)
    cardNumber!: string;
  }

  @e23.Recipe
  class BankTransferPayment {
    @Field(isString)
    bankCode!: string;
  }

  @e23.Recipe
  class DomesticAddress {
    @Field(isString)
    city!: string;
  }

  @e23.Recipe
  class InternationalAddress {
    @Field(isString)
    country!: string;
  }

  @e23.Recipe
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

  e23.seal();

  it('both discriminator fields deserialize correctly', async () => {
    const r = (await e23.deserialize(OrderDto, {
      orderId: 'ORD-1',
      payment: { type: 'creditcard', cardNumber: '4111111111111111' },
      address: { kind: 'domestic', city: 'Seoul' },
    })) as OrderDto;
    expect(r.payment).toBeInstanceOf(CreditCardPayment);
    expect((r.payment as CreditCardPayment).cardNumber).toBe('4111111111111111');
    expect(r.address).toBeInstanceOf(DomesticAddress);
    expect((r.address as DomesticAddress).city).toBe('Seoul');
  });

  it('second combination: bank + international', async () => {
    const r = (await e23.deserialize(OrderDto, {
      orderId: 'ORD-2',
      payment: { type: 'bank', bankCode: 'SWIFT123' },
      address: { kind: 'international', country: 'US' },
    })) as OrderDto;
    expect(r.payment).toBeInstanceOf(BankTransferPayment);
    expect(r.address).toBeInstanceOf(InternationalAddress);
  });

  it('payment invalid discriminator → error path on payment', async () => {
    const result = await e23.deserialize(OrderDto, {
      orderId: 'ORD-3',
      payment: { type: 'crypto', hash: 'abc' },
      address: { kind: 'domestic', city: 'Seoul' },
    });
    assertBakerIssueSet(result);
    const err = result.errors.find(x => x.code === 'invalidDiscriminator');
    expect(err).toBeDefined();
    expect(err!.path).toContain('payment');
  });

  it('address invalid discriminator → error path on address', async () => {
    const result = await e23.deserialize(OrderDto, {
      orderId: 'ORD-4',
      payment: { type: 'creditcard', cardNumber: '4111111111111111' },
      address: { kind: 'alien', planet: 'Mars' },
    });
    assertBakerIssueSet(result);
    const err = result.errors.find(x => x.code === 'invalidDiscriminator');
    expect(err).toBeDefined();
    expect(err!.path).toContain('address');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Discriminator default branch — context: { received, validSubTypes }
// ─────────────────────────────────────────────────────────────────────────────

describe('discriminator default branch — context payload', () => {
  it('validate() on unknown discriminator value includes received + validSubTypes', async () => {
    const b = new Baker({ stopAtFirstError: true });
    @b.Recipe
    class CatV {
      @Field(isString) kind!: string;
      @Field(isString) meow!: string;
    }
    @b.Recipe
    class DogV {
      @Field(isString) kind!: string;
      @Field(isString) bark!: string;
    }
    @b.Recipe
    class OwnerV {
      @Field({
        type: () => CatV,
        discriminator: {
          property: 'kind',
          subTypes: [
            { value: CatV, name: 'cat' },
            { value: DogV, name: 'dog' },
          ],
        },
      })
      pet!: CatV | DogV;
    }
    b.seal();
    const r = await b.validate(OwnerV, { pet: { kind: 'bird' } });
    assertBakerIssueSet(r);
    const err = r.errors.find((e: { code: string }) => e.code === 'invalidDiscriminator');
    expect((err as { context?: unknown })?.context).toMatchObject({ received: 'bird', validSubTypes: ['cat', 'dog'] });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// async serialize: discriminator array (each)
// ─────────────────────────────────────────────────────────────────────────────

describe('async serialize: discriminator + array (each)', () => {
  it('serializes an array of polymorphic DTOs in async DTO context', async () => {
    const b = new Baker();
    @b.Recipe
    class CatA {
      @Field(isString) kind!: string;
      @Field(isString) meow!: string;
    }
    @b.Recipe
    class DogA {
      @Field(isString) kind!: string;
      @Field(isString) bark!: string;
    }

    @b.Recipe
    class OwnerA {
      @Field({
        type: () => [CatA],
        discriminator: {
          property: 'kind',
          subTypes: [
            { value: CatA, name: 'cat' },
            { value: DogA, name: 'dog' },
          ],
        },
        keepDiscriminatorProperty: true,
      })
      pets!: (CatA | DogA)[];

      @Field(isString, {
        transform: { deserialize: ({ value }) => value, serialize: async ({ value }) => `<${value}>` },
      })
      tag!: string;
    }

    b.seal();
    const cat = Object.assign(Object.create(CatA.prototype), { kind: 'cat', meow: 'nya' });
    const dog = Object.assign(Object.create(DogA.prototype), { kind: 'dog', bark: 'woof' });
    const owner = Object.assign(Object.create(OwnerA.prototype), { pets: [cat, dog], tag: 'root' });

    const result = (await b.serialize(owner)) as Record<string, unknown>;
    expect(Array.isArray(result.pets)).toBe(true);
    expect(result.pets).toHaveLength(2);
    expect(result.tag).toBe('<root>');
  });
});

baker.seal();
