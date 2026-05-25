import { describe, it, expect, afterEach, beforeEach } from 'bun:test';

import { deserialize, serialize, Field, Recipe, isBakerIssueSet, seal } from '../../index';
import { isString, isNumber } from '../../src/rules/index';
import { assertBakerIssueSet } from './helpers/assert';
import { sealClass } from './helpers/seal';
import { unseal } from './helpers/unseal';

beforeEach(() => seal());
afterEach(() => unseal());

// ─── @Type(() => Dto) alone — auto nested ───────────────────────────────────

describe('@Type auto-nested', () => {
  it('should deserialize nested DTO with @Type alone', async () => {
    @Recipe
    class InnerDto {
      @Field(isString) value!: string;
    }
    sealClass(InnerDto);
    @Recipe
    class OuterDto {
      @Field({ type: () => InnerDto })
      inner!: InnerDto;
    }
    sealClass(OuterDto);
    const result = (await deserialize<OuterDto>(OuterDto, {
      inner: { value: 'hello' },
    })) as OuterDto;
    expect(result).toBeInstanceOf(OuterDto);
    expect(result.inner).toBeInstanceOf(InnerDto);
    expect(result.inner.value).toBe('hello');
  });

  it('should serialize nested DTO with @Type alone', async () => {
    @Recipe
    class InnerDto {
      @Field(isString) value!: string;
    }
    sealClass(InnerDto);
    @Recipe
    class OuterDto {
      @Field({ type: () => InnerDto })
      inner!: InnerDto;
    }
    sealClass(OuterDto);
    const dto = Object.assign(new OuterDto(), {
      inner: Object.assign(new InnerDto(), { value: 'world' }),
    });
    const result = await serialize(dto);
    expect((result['inner'] as { value?: unknown })['value']).toBe('world');
  });

  it('should return BakerIssueSet for invalid nested field with @Type alone', async () => {
    @Recipe
    class InnerDto {
      @Field(isNumber()) num!: number;
    }
    sealClass(InnerDto);
    @Recipe
    class OuterDto {
      @Field({ type: () => InnerDto })
      inner!: InnerDto;
    }
    sealClass(OuterDto);
    const result = await deserialize(OuterDto, {
      inner: { num: 'not a number' },
    });
    expect(isBakerIssueSet(result)).toBe(true);
  });
});

// ─── @Type(() => [Dto]) — array auto nested ─────────────────────────────────

describe('@Type(() => [Dto]) — array auto nested', () => {
  it('should deserialize array of nested DTOs', async () => {
    @Recipe
    class ItemDto {
      @Field(isString) name!: string;
    }
    sealClass(ItemDto);
    @Recipe
    class OrderDto {
      @Field({ type: () => [ItemDto] })
      items!: ItemDto[];
    }
    sealClass(OrderDto);
    const result = (await deserialize<OrderDto>(OrderDto, {
      items: [{ name: 'A' }, { name: 'B' }],
    })) as OrderDto;
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toBeInstanceOf(ItemDto);
    expect(result.items[0]!.name).toBe('A');
    expect(result.items[1]!.name).toBe('B');
  });

  it('should serialize array of nested DTOs', async () => {
    @Recipe
    class ItemDto {
      @Field(isString) name!: string;
    }
    sealClass(ItemDto);
    @Recipe
    class OrderDto {
      @Field({ type: () => [ItemDto] })
      items!: ItemDto[];
    }
    sealClass(OrderDto);
    const dto = Object.assign(new OrderDto(), {
      items: [Object.assign(new ItemDto(), { name: 'X' }), Object.assign(new ItemDto(), { name: 'Y' })],
    });
    const result = await serialize(dto);
    const items = result['items'] as Array<{ name: string }>;
    expect(items).toHaveLength(2);
    expect(items[0]!['name']).toBe('X');
    expect(items[1]!['name']).toBe('Y');
  });

  it('should return BakerIssueSet with isArray error when non-array passed to @Type(() => [Dto])', async () => {
    @Recipe
    class ItemDto {
      @Field(isString) name!: string;
    }
    sealClass(ItemDto);
    @Recipe
    class OrderDto {
      @Field({ type: () => [ItemDto] })
      items!: ItemDto[];
    }
    sealClass(OrderDto);
    const result = await deserialize(OrderDto, { items: 'not an array' });
    assertBakerIssueSet(result);
    expect(result.errors[0]!.code).toBe('isArray');
  });

  it('should validate each element in the array', async () => {
    @Recipe
    class ItemDto {
      @Field(isString) name!: string;
    }
    sealClass(ItemDto);
    @Recipe
    class OrderDto {
      @Field({ type: () => [ItemDto] })
      items!: ItemDto[];
    }
    sealClass(OrderDto);
    const result = await deserialize(OrderDto, {
      items: [{ name: 'valid' }, { name: 123 }],
    });
    assertBakerIssueSet(result);
    expect(result.errors.some(e => e.path.startsWith('items[1]'))).toBe(true);
  });

  it('should handle empty array', async () => {
    @Recipe
    class ItemDto {
      @Field(isString) name!: string;
    }
    sealClass(ItemDto);
    @Recipe
    class OrderDto {
      @Field({ type: () => [ItemDto] })
      items!: ItemDto[];
    }
    sealClass(OrderDto);
    const result = (await deserialize<OrderDto>(OrderDto, { items: [] })) as OrderDto;
    expect(result.items).toHaveLength(0);
  });
});

// ─── Primitive @Type — no auto nested ───────────────────────────────────────

describe('primitive @Type — no auto nested', () => {
  it('@Type(() => Number) should not trigger nested validation', async () => {
    @Recipe
    class PrimDto {
      @Field(isNumber(), { type: () => Number })
      value!: number;
    }
    sealClass(PrimDto);
    const result = (await deserialize<PrimDto>(PrimDto, { value: 42 })) as PrimDto;
    expect(result.value).toBe(42);
  });

  it('@Type(() => String) should not trigger nested validation', async () => {
    @Recipe
    class PrimDto {
      @Field(isString, { type: () => String })
      value!: string;
    }
    sealClass(PrimDto);
    const result = (await deserialize<PrimDto>(PrimDto, { value: 'hello' })) as PrimDto;
    expect(result.value).toBe('hello');
  });
});

// ─── unseal + re-seal ───────────────────────────────────────────────────────

describe('unseal + re-seal with @Type auto-nested', () => {
  it('should work correctly after unseal and re-deserialize', async () => {
    @Recipe
    class InnerDto {
      @Field(isString) value!: string;
    }
    sealClass(InnerDto);
    @Recipe
    class OuterDto {
      @Field({ type: () => InnerDto })
      inner!: InnerDto;
    }
    sealClass(OuterDto);
    const result1 = (await deserialize<OuterDto>(OuterDto, { inner: { value: 'first' } })) as OuterDto;
    expect(result1.inner.value).toBe('first');

    unseal();
    seal();
    const result2 = (await deserialize<OuterDto>(OuterDto, { inner: { value: 'second' } })) as OuterDto;
    expect(result2.inner.value).toBe('second');
  });
});
