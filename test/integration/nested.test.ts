import { describe, it, expect, afterEach, beforeEach } from 'bun:test';
import { deserialize, serialize, Field, isBakerError, configure } from '../../index';
import type { BakerErrors } from '../../index';
import { isString } from '../../src/rules/index';
import { unseal } from './helpers/unseal';

// ─── DTOs ────────────────────────────────────────────────────────────────────

class AddressDto {
  @Field(isString)
  street!: string;

  @Field(isString)
  city!: string;
}

class UserWithAddressDto {
  @Field(isString)
  name!: string;

  @Field({ type: () => AddressDto })
  address!: AddressDto;
}

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => unseal());
afterEach(() => { unseal(); configure({}); });

describe('nested — integration', () => {
  it('should deserialize nested DTO with valid input', async () => {
    const result = await deserialize<UserWithAddressDto>(UserWithAddressDto, {
      name: 'Alice',
      address: { street: '123 Main St', city: 'Springfield' },
    }) as UserWithAddressDto;
    expect(result).toBeInstanceOf(UserWithAddressDto);
    expect(result.address).toBeInstanceOf(AddressDto);
    expect(result.address.street).toBe('123 Main St');
    expect(result.address.city).toBe('Springfield');
  });

  it('should return BakerErrors for invalid nested field', async () => {
    const result = await deserialize(UserWithAddressDto, {
      name: 'Bob',
      address: { street: 123, city: 'Shelbyville' },
    });
    expect(isBakerError(result)).toBe(true);
  });

  it('should return BakerErrors when nested object has missing required field', async () => {
    const result = await deserialize(UserWithAddressDto, {
      name: 'Carol',
      address: { city: 'Capital City' },
    });
    expect(isBakerError(result)).toBe(true);
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
    class ItemDto {
      @Field(isString) name!: string;
    }
    class OrderDto {
      @Field({ type: () => [ItemDto] })
      items!: ItemDto[];
    }
    configure({ stopAtFirstError: true });
    const result = await deserialize<OrderDto>(OrderDto, {
      items: [{ name: 'A' }, { name: 'B' }],
    }) as OrderDto;
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toBeInstanceOf(ItemDto);
    expect(result.items[0]!.name).toBe('A');
  });

  it('should return first error for nested array with stopAtFirstError=true and invalid items', async () => {
    class ItemDto {
      @Field(isString) name!: string;
    }
    class OrderDto {
      @Field({ type: () => [ItemDto] })
      items!: ItemDto[];
    }
    configure({ stopAtFirstError: true });
    const result = await deserialize(OrderDto, {
      items: [{ name: 123 }, { name: 456 }],
    });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.path).toBe('items[0].name');
      expect(result.errors[0]!.code).toBe('isString');
    }
  });

  it('should return isArray error for nested array with stopAtFirstError=true and non-array input', async () => {
    class ItemDto {
      @Field(isString) name!: string;
    }
    class OrderDto {
      @Field({ type: () => [ItemDto] })
      items!: ItemDto[];
    }
    configure({ stopAtFirstError: true });
    const result = await deserialize(OrderDto, { items: 'not an array' });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors[0]!.code).toBe('isArray');
    }
  });

  it('should handle empty nested array with stopAtFirstError=true', async () => {
    class ItemDto {
      @Field(isString) name!: string;
    }
    class OrderDto {
      @Field({ type: () => [ItemDto] })
      items!: ItemDto[];
    }
    configure({ stopAtFirstError: true });
    const result = await deserialize<OrderDto>(OrderDto, { items: [] }) as OrderDto;
    expect(result.items).toHaveLength(0);
  });

  // ─── PB-3: keepDiscriminatorProperty ──────────────────────────────────────

  it('should keep discriminator property in output when keepDiscriminatorProperty is true', async () => {
    class TextContent {
      @Field(isString) body!: string;
    }
    class ImageContent {
      @Field(isString) url!: string;
    }
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
    const result = await deserialize<NotificationDto>(NotificationDto, {
      content: { type: 'text', body: 'hello' },
    }) as NotificationDto;
    expect(result.content).toBeInstanceOf(TextContent);
    expect((result.content as TextContent).body).toBe('hello');
    expect((result.content as any).type).toBe('text');
  });

  it('should NOT keep discriminator property when keepDiscriminatorProperty is false/undefined', async () => {
    class TextContent2 {
      @Field(isString) body!: string;
    }
    class NotificationDto2 {
      @Field({
        type: () => TextContent2,
        discriminator: {
          property: 'type',
          subTypes: [
            { value: TextContent2, name: 'text' },
          ],
        },
      })
      content!: TextContent2;
    }
    const result = await deserialize<NotificationDto2>(NotificationDto2, {
      content: { type: 'text', body: 'world' },
    }) as NotificationDto2;
    expect(result.content).toBeInstanceOf(TextContent2);
    expect((result.content as any).type).toBeUndefined();
  });

  it('should return BakerErrors with invalidDiscriminator for unknown discriminator value', async () => {
    class TextContent3 {
      @Field(isString) body!: string;
    }
    class NotificationDto3 {
      @Field({
        type: () => TextContent3,
        discriminator: {
          property: 'type',
          subTypes: [
            { value: TextContent3, name: 'text' },
          ],
        },
        keepDiscriminatorProperty: true,
      })
      content!: TextContent3;
    }
    const result = await deserialize(NotificationDto3, {
      content: { type: 'unknown', body: 'x' },
    });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors.some(e => e.code === 'invalidDiscriminator')).toBe(true);
    }
  });

  // ─── PB-4: serialize null nested ────────────────────────────────────────────

  it('should handle null nested field in serialize without crashing', async () => {
    class ParentDto {
      @Field({ type: () => AddressDto })
      address!: AddressDto | null;
    }
    const dto = new ParentDto();
    dto.address = null;
    const result = await serialize(dto);
    expect(result['address']).toBeNull();
  });
});
