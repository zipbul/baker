import { describe, it, expect } from 'bun:test';

import { Baker, BakerError, Field, isBakerIssueSet } from '../../index';
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

describe('discriminator — deserialize array (each)', () => {
  it('deserializes an array of discriminated elements, dispatching per element', async () => {
    const result = (await baker.deserialize(OwnerArrayDto, {
      name: 'Bob',
      pets: [
        { type: 'dog', breed: 'Shiba' },
        { type: 'cat', indoor: true },
      ],
    })) as OwnerArrayDto;
    expect(result.name).toBe('Bob');
    expect(result.pets).toHaveLength(2);
    expect(result.pets[0]).toEqual({ breed: 'Shiba' } as DogDto);
    expect(result.pets[1]).toEqual({ indoor: true } as unknown as CatDto);
  });

  it('reports invalidDiscriminator at the element path for a bad element', async () => {
    const result = await baker.deserialize(OwnerArrayDto, {
      name: 'Bob',
      pets: [
        { type: 'dog', breed: 'Shiba' },
        { type: 'fish', glub: true },
      ],
    });
    assertBakerIssueSet(result);
    const bad = result.errors.find(e => e.path === 'pets[1]');
    expect(bad).toBeDefined();
    expect(bad!.code).toBe('invalidDiscriminator');
  });

  it('validates element fields with element-level paths', async () => {
    const result = await baker.deserialize(OwnerArrayDto, {
      name: 'Bob',
      pets: [{ type: 'dog', breed: 123 }],
    });
    assertBakerIssueSet(result);
    expect(result.errors.some(e => e.path === 'pets[0].breed')).toBe(true);
  });

  it('validate() accepts a valid discriminated array', async () => {
    const result = await baker.validate(OwnerArrayDto, {
      name: 'Bob',
      pets: [
        { type: 'dog', breed: 'Shiba' },
        { type: 'cat', indoor: true },
      ],
    });
    expect(result).toBe(true);
  });

  it('validate() reports invalidDiscriminator at the element path', async () => {
    const result = await baker.validate(OwnerArrayDto, {
      name: 'Bob',
      pets: [{ type: 'fish', glub: true }],
    });
    assertBakerIssueSet(result);
    const bad = result.errors.find(e => e.path === 'pets[0]');
    expect(bad).toBeDefined();
    expect(bad!.code).toBe('invalidDiscriminator');
  });
});

describe('discriminator — serialize', () => {
  it('should serialize single discriminator field with instanceof dispatch (default drops discriminator key)', async () => {
    const dog = Object.assign(new DogDto(), { breed: 'Shiba' });
    const owner = Object.assign(new OwnerDto(), { name: 'Alice', pet: dog });
    const result = await baker.serialize(owner);
    expect(result.pet).toEqual({ breed: 'Shiba' });
  });

  it('should serialize array discriminator field with instanceof dispatch (default drops discriminator key)', async () => {
    const dog = Object.assign(new DogDto(), { breed: 'Poodle' });
    const cat = Object.assign(new CatDto(), { indoor: true });
    const owner = Object.assign(new OwnerArrayDto(), { name: 'Bob', pets: [dog, cat] });
    const result = await baker.serialize(owner);
    expect(result.pets).toEqual([{ breed: 'Poodle' }, { indoor: true }]);
  });

  it('keepDiscriminatorProperty:true → serialize retains the discriminator key', async () => {
    const dog = Object.assign(new DogDto(), { breed: 'Shiba' });
    const owner = Object.assign(new OwnerKeepDiscDto(), { pet: dog });
    const result = await baker.serialize(owner);
    expect(result.pet).toEqual({ breed: 'Shiba', kind: 'dog' });
  });

  it('default (unset) → discriminator key dropped symmetrically across deserialize + serialize (round-trip)', async () => {
    const de = (await baker.deserialize(OwnerDto, { name: 'Z', pet: { type: 'cat', indoor: true } })) as OwnerDto;
    expect((de.pet as { type?: unknown }).type).toBeUndefined();
    const ser = await baker.serialize(de);
    expect((ser.pet as { type?: unknown }).type).toBeUndefined();
  });

  it('instance matching NO subtype → throws BakerError instead of leaking the raw object', () => {
    // `pet` is a plain object, not an instance of any subtype (DogDto/CatDto).
    const owner = Object.assign(new OwnerDto(), { name: 'Ghost', pet: { breed: 'ghost', venom: 'yes' } });
    expect(() => baker.serializeSync(owner)).toThrow(BakerError);
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

// ─────────────────────────────────────────────────────────────────────────────
// async deserialize/validate: discriminator + array (exercises the `await` codegen branch)
// ─────────────────────────────────────────────────────────────────────────────

describe('discriminator + array — async deserialize/validate', () => {
  const ab = new Baker();
  @ab.Recipe
  class CatA {
    @Field(isString) kind!: string;
    @Field(isString, { transform: { deserialize: async ({ value }) => value, serialize: ({ value }) => value } })
    meow!: string;
  }
  @ab.Recipe
  class DogA {
    @Field(isString) kind!: string;
    @Field(isString) bark!: string;
  }
  @ab.Recipe
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
    })
    pets!: (CatA | DogA)[];
  }
  ab.seal();

  it('deserialize resolves a discriminated array through an async element transform', async () => {
    const r = await ab.deserialize(OwnerA, {
      pets: [
        { kind: 'cat', meow: 'nya' },
        { kind: 'dog', bark: 'woof' },
      ],
    });
    expect(isBakerIssueSet(r)).toBe(false);
    expect((r as OwnerA).pets).toHaveLength(2);
  });

  it('deserialize reports invalidDiscriminator at the element path (async)', async () => {
    const r = await ab.deserialize(OwnerA, { pets: [{ kind: 'fish' }] });
    assertBakerIssueSet(r);
    const bad = r.errors.find(e => e.path === 'pets[0]');
    expect(bad).toBeDefined();
    expect(bad!.code).toBe('invalidDiscriminator');
  });

  it('validate accepts a valid discriminated array (async)', async () => {
    const r = await ab.validate(OwnerA, {
      pets: [
        { kind: 'cat', meow: 'nya' },
        { kind: 'dog', bark: 'woof' },
      ],
    });
    expect(r).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// discriminator + array under stopAtFirstError (exercises the early-return branches)
// ─────────────────────────────────────────────────────────────────────────────

describe('discriminator + array — stopAtFirstError (early return)', () => {
  const sb = new Baker({ stopAtFirstError: true });
  @sb.Recipe
  class Cat2 {
    @Field(isString) kind!: string;
    @Field(isString) meow!: string;
  }
  @sb.Recipe
  class Dog2 {
    @Field(isString) kind!: string;
    @Field(isString) bark!: string;
  }
  @sb.Recipe
  class Owner2 {
    @Field(isString) name!: string;
    @Field({
      type: () => [Cat2],
      discriminator: {
        property: 'kind',
        subTypes: [
          { value: Cat2, name: 'cat' },
          { value: Dog2, name: 'dog' },
        ],
      },
    })
    pets!: (Cat2 | Dog2)[];
  }
  sb.seal();

  it('deserialize returns invalidDiscriminator on the first bad element', async () => {
    const r = await sb.deserialize(Owner2, { name: 'A', pets: [{ kind: 'fish' }] });
    assertBakerIssueSet(r);
    expect(r.errors[0]!.path).toBe('pets[0]');
    expect(r.errors[0]!.code).toBe('invalidDiscriminator');
  });

  it('deserialize returns the first nested element error with element path', async () => {
    const r = await sb.deserialize(Owner2, { name: 'A', pets: [{ kind: 'cat', meow: 123 }] });
    assertBakerIssueSet(r);
    expect(r.errors[0]!.path).toBe('pets[0].meow');
  });

  it('validate returns invalidDiscriminator on the first bad element', async () => {
    const r = await sb.validate(Owner2, { name: 'A', pets: [{ kind: 'fish' }] });
    assertBakerIssueSet(r);
    expect(r.errors[0]!.path).toBe('pets[0]');
    expect(r.errors[0]!.code).toBe('invalidDiscriminator');
  });

  it('deserialize succeeds on a valid array', async () => {
    const r = (await sb.deserialize(Owner2, {
      name: 'A',
      pets: [
        { kind: 'cat', meow: 'nya' },
        { kind: 'dog', bark: 'woof' },
      ],
    })) as Owner2;
    expect(r.pets).toHaveLength(2);
  });
});

baker.seal();
