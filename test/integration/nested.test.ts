import { describe, it, expect } from 'bun:test';

import { deserialize, serialize, validate, Field, Baker, isBakerIssueSet, arrayOf } from '../../index';
import { isString } from '../../src/rules/index';
import { assertBakerIssueSet } from './helpers/assert';

// ─── DTOs ────────────────────────────────────────────────────────────────────

const baker = new Baker();

@baker.Recipe
class AddressDto {
  @Field(isString)
  street!: string;

  @Field(isString)
  city!: string;
}

@baker.Recipe
class UserWithAddressDto {
  @Field(isString)
  name!: string;

  @Field({ type: () => AddressDto })
  address!: AddressDto;
}

baker.seal();

// ─────────────────────────────────────────────────────────────────────────────

describe('nested — integration', () => {
  it('should deserialize nested DTO with valid input', async () => {
    const result = (await deserialize<UserWithAddressDto>(UserWithAddressDto, {
      name: 'Alice',
      address: { street: '123 Main St', city: 'Springfield' },
    })) as UserWithAddressDto;
    expect(result).toBeInstanceOf(UserWithAddressDto);
    expect(result.address).toBeInstanceOf(AddressDto);
    expect(result.address.street).toBe('123 Main St');
    expect(result.address.city).toBe('Springfield');
  });

  it('should return BakerIssueSet for invalid nested field', async () => {
    const result = await deserialize(UserWithAddressDto, {
      name: 'Bob',
      address: { street: 123, city: 'Shelbyville' },
    });
    expect(isBakerIssueSet(result)).toBe(true);
  });

  it('should return BakerIssueSet when nested object has missing required field', async () => {
    const result = await deserialize(UserWithAddressDto, {
      name: 'Carol',
      address: { city: 'Capital City' },
    });
    expect(isBakerIssueSet(result)).toBe(true);
  });

  it('should serialize instance with nested DTO', async () => {
    const dto = Object.assign(new UserWithAddressDto(), {
      name: 'Dave',
      address: Object.assign(new AddressDto(), { street: '456 Elm St', city: 'Shelbyville' }),
    });
    const result = await serialize(dto);
    expect(result['name']).toBe('Dave');
    expect((result['address'] as Record<string, unknown>)['street']).toBe('456 Elm St');
    expect((result['address'] as Record<string, unknown>)['city']).toBe('Shelbyville');
  });

  // ─── BUG-1: stopAtFirstError + nested array ────────────────────────────────

  it('should deserialize nested array with stopAtFirstError=true and valid items', async () => {
    const b = new Baker({ stopAtFirstError: true });
    @b.Recipe
    class ItemDto {
      @Field(isString) name!: string;
    }
    @b.Recipe
    class OrderDto {
      @Field({ type: () => [ItemDto] })
      items!: ItemDto[];
    }
    b.seal();
    const result = (await deserialize<OrderDto>(OrderDto, {
      items: [{ name: 'A' }, { name: 'B' }],
    })) as OrderDto;
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toBeInstanceOf(ItemDto);
    expect(result.items[0]!.name).toBe('A');
  });

  it('should return first error for nested array with stopAtFirstError=true and invalid items', async () => {
    const b = new Baker({ stopAtFirstError: true });
    @b.Recipe
    class ItemDto {
      @Field(isString) name!: string;
    }
    @b.Recipe
    class OrderDto {
      @Field({ type: () => [ItemDto] })
      items!: ItemDto[];
    }
    b.seal();
    const result = await deserialize(OrderDto, {
      items: [{ name: 123 }, { name: 456 }],
    });
    assertBakerIssueSet(result);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.path).toBe('items[0].name');
    expect(result.errors[0]!.code).toBe('isString');
  });

  it('should return isArray error for nested array with stopAtFirstError=true and non-array input', async () => {
    const b = new Baker({ stopAtFirstError: true });
    @b.Recipe
    class ItemDto {
      @Field(isString) name!: string;
    }
    @b.Recipe
    class OrderDto {
      @Field({ type: () => [ItemDto] })
      items!: ItemDto[];
    }
    b.seal();
    const result = await deserialize(OrderDto, { items: 'not an array' });
    assertBakerIssueSet(result);
    expect(result.errors[0]!.code).toBe('isArray');
  });

  it('should handle empty nested array with stopAtFirstError=true', async () => {
    const b = new Baker({ stopAtFirstError: true });
    @b.Recipe
    class ItemDto {
      @Field(isString) name!: string;
    }
    @b.Recipe
    class OrderDto {
      @Field({ type: () => [ItemDto] })
      items!: ItemDto[];
    }
    b.seal();
    const result = (await deserialize<OrderDto>(OrderDto, { items: [] })) as OrderDto;
    expect(result.items).toHaveLength(0);
  });

  // ─── PB-3: keepDiscriminatorProperty ──────────────────────────────────────

  it('should keep discriminator property in output when keepDiscriminatorProperty is true', async () => {
    const b = new Baker();
    @b.Recipe
    class TextContent {
      @Field(isString) body!: string;
    }
    @b.Recipe
    class ImageContent {
      @Field(isString) url!: string;
    }
    @b.Recipe
    class NotificationDto {
      @Field({
        type: () => TextContent,
        discriminator: {
          property: 'type',
          subTypes: [
            { value: TextContent, name: 'text' },
            { value: ImageContent, name: 'image' },
          ],
        },
        keepDiscriminatorProperty: true,
      })
      content!: TextContent | ImageContent;
    }
    b.seal();
    const result = (await deserialize<NotificationDto>(NotificationDto, {
      content: { type: 'text', body: 'hello' },
    })) as NotificationDto;
    expect(result.content).toBeInstanceOf(TextContent);
    expect((result.content as TextContent).body).toBe('hello');
    expect((result.content as { type?: unknown }).type).toBe('text');
  });

  it('should NOT keep discriminator property when keepDiscriminatorProperty is false/undefined', async () => {
    const b = new Baker();
    @b.Recipe
    class TextContent2 {
      @Field(isString) body!: string;
    }
    @b.Recipe
    class NotificationDto2 {
      @Field({
        type: () => TextContent2,
        discriminator: {
          property: 'type',
          subTypes: [{ value: TextContent2, name: 'text' }],
        },
      })
      content!: TextContent2;
    }
    b.seal();
    const result = (await deserialize<NotificationDto2>(NotificationDto2, {
      content: { type: 'text', body: 'world' },
    })) as NotificationDto2;
    expect(result.content).toBeInstanceOf(TextContent2);
    expect((result.content as { type?: unknown }).type).toBeUndefined();
  });

  it('should return BakerIssueSet with invalidDiscriminator for unknown discriminator value', async () => {
    const b = new Baker();
    @b.Recipe
    class TextContent3 {
      @Field(isString) body!: string;
    }
    @b.Recipe
    class NotificationDto3 {
      @Field({
        type: () => TextContent3,
        discriminator: {
          property: 'type',
          subTypes: [{ value: TextContent3, name: 'text' }],
        },
        keepDiscriminatorProperty: true,
      })
      content!: TextContent3;
    }
    b.seal();
    const result = await deserialize(NotificationDto3, {
      content: { type: 'unknown', body: 'x' },
    });
    assertBakerIssueSet(result);
    expect(result.errors.some(e => e.code === 'invalidDiscriminator')).toBe(true);
  });

  // ─── PB-4: serialize null nested ────────────────────────────────────────────

  it('should handle null nested field in serialize without crashing', async () => {
    const b = new Baker();
    @b.Recipe
    class AddressDto2 {
      @Field(isString) street!: string;
      @Field(isString) city!: string;
    }
    @b.Recipe
    class ParentDto {
      @Field({ type: () => AddressDto2 })
      address!: AddressDto2 | null;
    }
    b.seal();
    const dto = new ParentDto();
    dto.address = null;
    const result = await serialize(dto);
    expect(result['address']).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Circular DTO error-path accuracy (deserialize + validate must agree, full prefix)
// ─────────────────────────────────────────────────────────────────────────────

describe('nested — circular DTO error path', () => {
  const cb = new Baker();
  @cb.Recipe
  class CircA {
    @Field({ optional: true, type: () => CircB }) child?: CircB;
    @Field(isString) v!: string;
  }
  @cb.Recipe
  class CircB {
    @Field({ optional: true, type: () => CircA }) parent?: CircA;
    @Field(isString) w!: string;
  }
  cb.seal();

  it('reports the full path for a deeply nested circular error (deserialize and validate agree)', async () => {
    const input = { v: 'x', child: { w: 'y', parent: { v: 'z', child: { w: 123 } } } };
    const d = await deserialize(CircA, input);
    const v = await validate(CircA, input);
    assertBakerIssueSet(d);
    assertBakerIssueSet(v);
    expect(d.errors.some(e => e.path === 'child.parent.child.w')).toBe(true);
    expect(v.errors.some(e => e.path === 'child.parent.child.w')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Validate-only collection fallbacks inside an inlined nested DTO must prepend
// the parent path prefix (regression: array/Set/Map nested-DTO fallback and the
// scalar `each` branch all built the path from the field key alone).
// ─────────────────────────────────────────────────────────────────────────────

describe('nested — validate-only collection error paths carry parent prefix', () => {
  const pb = new Baker();
  @pb.Recipe
  class SelfLeaf {
    @Field({ optional: true, type: () => [SelfLeaf] }) items?: SelfLeaf[];
    @Field(arrayOf(isString), { optional: true, type: () => Set }) tags?: Set<string>;
    @Field(isString) w!: string;
  }
  @pb.Recipe
  class SetLeaf {
    @Field({ optional: true, type: () => Set, setValue: () => SetLeaf }) kids?: Set<SetLeaf>;
    @Field(isString) w!: string;
  }
  @pb.Recipe
  class MapLeaf {
    @Field({ optional: true, type: () => Map, mapValue: () => MapLeaf }) kids?: Map<string, MapLeaf>;
    @Field(isString) w!: string;
  }
  @pb.Recipe
  class PrefixRoot {
    @Field({ optional: true, type: () => SelfLeaf }) child?: SelfLeaf;
    @Field({ optional: true, type: () => SetLeaf }) sc?: SetLeaf;
    @Field({ optional: true, type: () => MapLeaf }) mc?: MapLeaf;
    @Field(isString) v!: string;
  }
  pb.seal();

  const pathsOf = async (input: object): Promise<string[]> => {
    const r = await validate(PrefixRoot, input);
    assertBakerIssueSet(r);
    return r.errors.map(e => e.path);
  };

  it('circular array fallback', async () => {
    expect(await pathsOf({ v: 'x', child: { w: 'y', items: [{ w: 123 }] } })).toContain('child.items[0].w');
  });

  it('scalar each on a nested Set', async () => {
    expect(await pathsOf({ v: 'x', child: { w: 'y', tags: [123] } })).toContain('child.tags[0]');
  });

  it('circular Set fallback', async () => {
    expect(await pathsOf({ v: 'x', sc: { w: 'y', kids: [{ w: 123 }] } })).toContain('sc.kids[0].w');
  });

  it('circular Map fallback', async () => {
    expect(await pathsOf({ v: 'x', mc: { w: 'y', kids: { a: { w: 123 } } } })).toContain('mc.kids[a].w');
  });
});
