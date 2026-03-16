import { describe, it, expect, afterEach } from 'bun:test';
import { deserialize, serialize, Field, BakerValidationError } from '../../index';
import { isString, isNumber } from '../../src/rules/index';
import { unseal } from './helpers/unseal';

afterEach(() => unseal());

// ─── @Type(() => Dto) alone — auto nested ───────────────────────────────────

describe('@Type auto-nested', () => {
  it('should deserialize nested DTO with @Type alone', async () => {
    class InnerDto {
      @Field(isString) value!: string;
    }
    class OuterDto {
      @Field({ type: () => InnerDto })
      inner!: InnerDto;
    }
    const result = await deserialize<OuterDto>(OuterDto, {
      inner: { value: 'hello' },
    });
    expect(result).toBeInstanceOf(OuterDto);
    expect(result.inner).toBeInstanceOf(InnerDto);
    expect(result.inner.value).toBe('hello');
  });

  it('should serialize nested DTO with @Type alone', async () => {
    class InnerDto {
      @Field(isString) value!: string;
    }
    class OuterDto {
      @Field({ type: () => InnerDto })
      inner!: InnerDto;
    }
    const dto = Object.assign(new OuterDto(), {
      inner: Object.assign(new InnerDto(), { value: 'world' }),
    });
    const result = await serialize(dto);
    expect((result['inner'] as any)['value']).toBe('world');
  });

  it('should throw validation error for invalid nested field with @Type alone', async () => {
    class InnerDto {
      @Field(isNumber()) num!: number;
    }
    class OuterDto {
      @Field({ type: () => InnerDto })
      inner!: InnerDto;
    }
    await expect(deserialize(OuterDto, {
      inner: { num: 'not a number' },
    })).rejects.toThrow(BakerValidationError);
  });
});

// ─── @Type(() => [Dto]) — array auto nested ─────────────────────────────────

describe('@Type(() => [Dto]) — array auto nested', () => {
  it('should deserialize array of nested DTOs', async () => {
    class ItemDto {
      @Field(isString) name!: string;
    }
    class OrderDto {
      @Field({ type: () => [ItemDto] })
      items!: ItemDto[];
    }
    const result = await deserialize<OrderDto>(OrderDto, {
      items: [{ name: 'A' }, { name: 'B' }],
    });
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toBeInstanceOf(ItemDto);
    expect(result.items[0]!.name).toBe('A');
    expect(result.items[1]!.name).toBe('B');
  });

  it('should serialize array of nested DTOs', async () => {
    class ItemDto {
      @Field(isString) name!: string;
    }
    class OrderDto {
      @Field({ type: () => [ItemDto] })
      items!: ItemDto[];
    }
    const dto = Object.assign(new OrderDto(), {
      items: [
        Object.assign(new ItemDto(), { name: 'X' }),
        Object.assign(new ItemDto(), { name: 'Y' }),
      ],
    });
    const result = await serialize(dto);
    const items = result['items'] as any[];
    expect(items).toHaveLength(2);
    expect(items[0]['name']).toBe('X');
    expect(items[1]['name']).toBe('Y');
  });

  it('should throw isArray error when non-array passed to @Type(() => [Dto])', async () => {
    class ItemDto {
      @Field(isString) name!: string;
    }
    class OrderDto {
      @Field({ type: () => [ItemDto] })
      items!: ItemDto[];
    }
    try {
      await deserialize(OrderDto, { items: 'not an array' });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(BakerValidationError);
      expect((e as BakerValidationError).errors[0]!.code).toBe('isArray');
    }
  });

  it('should validate each element in the array', async () => {
    class ItemDto {
      @Field(isString) name!: string;
    }
    class OrderDto {
      @Field({ type: () => [ItemDto] })
      items!: ItemDto[];
    }
    try {
      await deserialize(OrderDto, {
        items: [{ name: 'valid' }, { name: 123 }],
      });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(BakerValidationError);
      const err = e as BakerValidationError;
      expect(err.errors.some(e => e.path.startsWith('items[1]'))).toBe(true);
    }
  });

  it('should handle empty array', async () => {
    class ItemDto {
      @Field(isString) name!: string;
    }
    class OrderDto {
      @Field({ type: () => [ItemDto] })
      items!: ItemDto[];
    }
    const result = await deserialize<OrderDto>(OrderDto, { items: [] });
    expect(result.items).toHaveLength(0);
  });
});

// ─── Primitive @Type — no auto nested ───────────────────────────────────────

describe('primitive @Type — no auto nested', () => {
  it('@Type(() => Number) should not trigger nested validation', async () => {
    class PrimDto {
      @Field(isNumber(), { type: () => Number })
      value!: number;
    }
    const result = await deserialize<PrimDto>(PrimDto, { value: 42 });
    expect(result.value).toBe(42);
  });

  it('@Type(() => String) should not trigger nested validation', async () => {
    class PrimDto {
      @Field(isString, { type: () => String })
      value!: string;
    }
    const result = await deserialize<PrimDto>(PrimDto, { value: 'hello' });
    expect(result.value).toBe('hello');
  });
});

// ─── unseal + re-seal ───────────────────────────────────────────────────────

describe('unseal + re-seal with @Type auto-nested', () => {
  it('should work correctly after unseal and re-deserialize', async () => {
    class InnerDto {
      @Field(isString) value!: string;
    }
    class OuterDto {
      @Field({ type: () => InnerDto })
      inner!: InnerDto;
    }
    const result1 = await deserialize<OuterDto>(OuterDto, { inner: { value: 'first' } });
    expect(result1.inner.value).toBe('first');

    unseal();
    const result2 = await deserialize<OuterDto>(OuterDto, { inner: { value: 'second' } });
    expect(result2.inner.value).toBe('second');
  });
});
