import { describe, it, expect, afterEach } from 'bun:test';
import { deserialize, serialize, isBakerError, Field } from '../../index';
import { isString, isEmail, min, arrayMinSize } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';
import { SealError } from '../../src/errors';
import { globalRegistry } from '../../src/registry';

function cleanUp() {
  for (const cls of [...globalRegistry]) globalRegistry.delete(cls);
  unseal();
}

// ─────────────────────────────────────────────────────────────────────────────
// deserialize-builder.ts:560 — conflicting requiresType
// ─────────────────────────────────────────────────────────────────────────────

describe('conflicting requiresType → SealError', () => {
  afterEach(cleanUp);

  it('isEmail (string) + min (number) on same field → SealError at seal time', () => {
    class ConflictDto {
      @Field(isEmail(), min(5)) value!: unknown;
    }
    expect(() => deserialize(ConflictDto, { value: 'x' })).toThrow(SealError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// deserialize-builder.ts:935-936 — array-level rules on Set collection
// ─────────────────────────────────────────────────────────────────────────────

describe('Set collection + array-level rules', () => {
  class SetItem {
    @Field(isString) name!: string;
  }

  class SetWithMinDto {
    @Field(arrayMinSize(2), { type: () => Set as any, setValue: () => SetItem })
    items!: Set<SetItem>;
  }

  it('Set with arrayMinSize — valid', async () => {
    const result = await deserialize(SetWithMinDto, { items: [{ name: 'a' }, { name: 'b' }] }) as SetWithMinDto;
    expect(result.items).toBeInstanceOf(Set);
    expect(result.items.size).toBe(2);
  });

  it('Set with arrayMinSize — too few items → error', async () => {
    const result = await deserialize(SetWithMinDto, { items: [{ name: 'a' }] });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors.some(e => e.code === 'arrayMinSize')).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// serialize-builder.ts:145 — async serialize of Set<DTO>
// ─────────────────────────────────────────────────────────────────────────────

describe('async serialize Set<DTO>', () => {
  class SetItemDto {
    @Field(isString) name!: string;
  }

  class AsyncSerSetDto {
    @Field({ type: () => Set as any, setValue: () => SetItemDto })
    items!: Set<SetItemDto>;

    @Field(isString, {
      transform: async ({ value }) => value,
    })
    other!: string;
  }

  it('serialize Set<DTO> when DTO has async transform on another field', async () => {
    const dto = await deserialize(AsyncSerSetDto, {
      items: [{ name: 'hello' }, { name: 'world' }],
      other: 'test',
    }) as AsyncSerSetDto;
    expect(dto.items).toBeInstanceOf(Set);
    const result = await serialize(dto);
    expect(result.items).toBeDefined();
    expect(Array.isArray(result.items)).toBe(true);
    expect((result.items as any[]).length).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// serialize.ts:26 — constructor-less object
// ─────────────────────────────────────────────────────────────────────────────

describe('serialize — constructor-less object', () => {
  it('object without constructor → SealError', () => {
    const obj = Object.create(null);
    obj.name = 'Alice';
    expect(() => serialize(obj)).toThrow(SealError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// seal.ts:49 — @Type function that throws
// ─────────────────────────────────────────────────────────────────────────────

describe('@Type function that throws → error during seal', () => {
  afterEach(cleanUp);

  it('type function throwing during seal → propagates error', () => {
    class BadTypeDto {
      @Field({ type: () => { throw new Error('broken type'); } })
      nested!: unknown;
    }
    expect(() => deserialize(BadTypeDto, { nested: {} })).toThrow('broken type');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// serialize-builder.ts:225 — async serialize array of discriminated DTOs
// ─────────────────────────────────────────────────────────────────────────────

describe('async serialize array of nested DTOs', () => {
  class ItemDto {
    @Field(isString) name!: string;
  }

  class AsyncArrayDto {
    @Field({ type: () => [ItemDto] })
    items!: ItemDto[];

    @Field(isString, { transform: async ({ value }) => value })
    tag!: string;
  }

  it('serialize array of nested DTOs in async context', async () => {
    const dto = await deserialize(AsyncArrayDto, {
      items: [{ name: 'a' }, { name: 'b' }],
      tag: 'test',
    }) as AsyncArrayDto;
    const result = await serialize(dto);
    expect(Array.isArray(result.items)).toBe(true);
    expect((result.items as any[]).length).toBe(2);
  });
});

describe('async serialize discriminator array (serialize-builder.ts:225)', () => {
  class CatDto {
    @Field(isString) kind!: string;
    @Field(isString) meow!: string;
  }

  class DogDto {
    @Field(isString) kind!: string;
    @Field(isString) bark!: string;
  }

  class AsyncDiscArrayDto {
    @Field({
      type: () => [CatDto],
      discriminator: {
        property: 'kind',
        subTypes: [
          { value: CatDto, name: 'cat' },
          { value: DogDto, name: 'dog' },
        ],
      },
      keepDiscriminatorProperty: true,
    })
    pets!: (CatDto | DogDto)[];

    @Field(isString, { transform: async ({ value }) => value })
    tag!: string;
  }

  it('serialize discriminator array in async DTO', async () => {
    const cat = Object.assign(Object.create(CatDto.prototype), { kind: 'cat', meow: 'nya' });
    const dog = Object.assign(Object.create(DogDto.prototype), { kind: 'dog', bark: 'woof' });
    const dto = Object.assign(Object.create(AsyncDiscArrayDto.prototype), { pets: [cat, dog], tag: 'test' });
    const result = await serialize(dto);
    expect(Array.isArray(result.pets)).toBe(true);
    expect((result.pets as any[]).length).toBe(2);
  });
});

