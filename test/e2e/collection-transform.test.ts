import { describe, it, expect, afterEach } from 'bun:test';
import { Field, deserialize, serialize, toJsonSchema, configure, BakerValidationError } from '../../index';
import { isString, isNumber, minLength, arrayMinSize } from '../../src/rules/index';
import { arrayOf } from '../../src/decorators/field';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─── DTOs ────────────────────────────────────────────────────────────────────

// Set<primitive>
class PrimitiveSetDto {
  @Field({ type: () => Set as any })
  tags!: Set<string>;
}

// Set<DTO>
class TagDto {
  @Field(isString, minLength(1))
  name!: string;
}

class NestedSetDto {
  @Field({ type: () => Set as any, setValue: () => TagDto })
  tags!: Set<TagDto>;
}

// Map<string, primitive>
class PrimitiveMapDto {
  @Field({ type: () => Map as any })
  config!: Map<string, unknown>;
}

// Map<string, DTO>
class PriceDto {
  @Field(isNumber())
  amount!: number;
}

class NestedMapDto {
  @Field({ type: () => Map as any, mapValue: () => PriceDto })
  prices!: Map<string, PriceDto>;
}

// Set with validation rules
class ValidatedSetDto {
  @Field(arrayOf(isString, minLength(2)), { type: () => Set as any })
  items!: Set<string>;
}

// Optional/nullable collection
class OptionalSetDto {
  @Field({ type: () => Set as any, optional: true })
  tags?: Set<string>;
}

class NullableMapDto {
  @Field({ type: () => Map as any, nullable: true })
  data!: Map<string, unknown> | null;
}

// ─── Set<primitive> ──────────────────────────────────────────────────────────

describe('Set<primitive> — deserialize', () => {
  it('array → Set conversion', async () => {
    const result = await deserialize(PrimitiveSetDto, { tags: ['a', 'b', 'c'] });
    expect(result.tags).toBeInstanceOf(Set);
    expect([...result.tags]).toEqual(['a', 'b', 'c']);
  });

  it('empty array → empty Set', async () => {
    const result = await deserialize(PrimitiveSetDto, { tags: [] });
    expect(result.tags).toBeInstanceOf(Set);
    expect(result.tags.size).toBe(0);
  });

  it('non-array input → error', async () => {
    await expect(
      deserialize(PrimitiveSetDto, { tags: 'not-array' }),
    ).rejects.toThrow();
  });
});

describe('Set<primitive> — serialize', () => {
  it('Set → array conversion', async () => {
    const dto = Object.assign(new PrimitiveSetDto(), { tags: new Set(['x', 'y']) });
    const result = await serialize(dto);
    expect(result['tags']).toEqual(['x', 'y']);
  });
});

// ─── Set<DTO> ────────────────────────────────────────────────────────────────

describe('Set<DTO> — deserialize', () => {
  it('array of objects → Set of DTO instances', async () => {
    const result = await deserialize(NestedSetDto, {
      tags: [{ name: 'alpha' }, { name: 'beta' }],
    });
    expect(result.tags).toBeInstanceOf(Set);
    expect(result.tags.size).toBe(2);
    const arr = [...result.tags];
    expect(arr[0]).toBeInstanceOf(TagDto);
    expect(arr[0]!.name).toBe('alpha');
    expect(arr[1]!.name).toBe('beta');
  });

  it('nested DTO validation failure → error with index path', async () => {
    try {
      await deserialize(NestedSetDto, {
        tags: [{ name: 'ok' }, { name: '' }],
      });
      expect.unreachable('should have thrown');
    } catch (e: any) {
      expect(e.errors.length).toBeGreaterThan(0);
      const err = e.errors.find((e: any) => e.path.includes('[1]'));
      expect(err).toBeDefined();
    }
  });
});

describe('Set<DTO> — serialize', () => {
  it('Set of DTO → array of plain objects', async () => {
    const tag1 = Object.assign(new TagDto(), { name: 'a' });
    const tag2 = Object.assign(new TagDto(), { name: 'b' });
    const dto = Object.assign(new NestedSetDto(), { tags: new Set([tag1, tag2]) });
    const result = await serialize(dto);
    expect(result['tags']).toEqual([{ name: 'a' }, { name: 'b' }]);
  });
});

// ─── Map<string, primitive> ─────────────────────────────────────────────────

describe('Map<string, primitive> — deserialize', () => {
  it('plain object → Map conversion', async () => {
    const result = await deserialize(PrimitiveMapDto, { config: { key1: 'val1', key2: 42 } });
    expect(result.config).toBeInstanceOf(Map);
    expect(result.config.get('key1')).toBe('val1');
    expect(result.config.get('key2')).toBe(42);
  });

  it('empty object → empty Map', async () => {
    const result = await deserialize(PrimitiveMapDto, { config: {} });
    expect(result.config).toBeInstanceOf(Map);
    expect(result.config.size).toBe(0);
  });

  it('array input → error', async () => {
    await expect(
      deserialize(PrimitiveMapDto, { config: [1, 2] }),
    ).rejects.toThrow();
  });

  it('null input → error', async () => {
    await expect(
      deserialize(PrimitiveMapDto, { config: null }),
    ).rejects.toThrow();
  });
});

describe('Map<string, primitive> — serialize', () => {
  it('Map → plain object conversion', async () => {
    const map = new Map<string, unknown>([['a', 1], ['b', 'two']]);
    const dto = Object.assign(new PrimitiveMapDto(), { config: map });
    const result = await serialize(dto);
    expect(result['config']).toEqual({ a: 1, b: 'two' });
  });
});

// ─── Map<string, DTO> ──────────────────────────────────────────────────────

describe('Map<string, DTO> — deserialize', () => {
  it('plain object → Map of DTO instances', async () => {
    const result = await deserialize(NestedMapDto, {
      prices: { USD: { amount: 100 }, KRW: { amount: 130000 } },
    });
    expect(result.prices).toBeInstanceOf(Map);
    expect(result.prices.size).toBe(2);
    expect(result.prices.get('USD')).toBeInstanceOf(PriceDto);
    expect(result.prices.get('USD')!.amount).toBe(100);
    expect(result.prices.get('KRW')!.amount).toBe(130000);
  });

  it('nested DTO validation failure → error with key path', async () => {
    try {
      await deserialize(NestedMapDto, {
        prices: { USD: { amount: 100 }, KRW: { amount: 'bad' } },
      });
      expect.unreachable('should have thrown');
    } catch (e: any) {
      expect(e.errors.length).toBeGreaterThan(0);
      const err = e.errors.find((e: any) => e.path.includes('KRW'));
      expect(err).toBeDefined();
    }
  });
});

describe('Map<string, DTO> — serialize', () => {
  it('Map of DTO → plain object of plain objects', async () => {
    const usd = Object.assign(new PriceDto(), { amount: 50 });
    const eur = Object.assign(new PriceDto(), { amount: 45 });
    const map = new Map([['USD', usd], ['EUR', eur]]);
    const dto = Object.assign(new NestedMapDto(), { prices: map });
    const result = await serialize(dto);
    expect(result['prices']).toEqual({ USD: { amount: 50 }, EUR: { amount: 45 } });
  });
});

// ─── Set with validation ─────────────────────────────────────────────────────

describe('Set with each validation', () => {
  it('each element validation succeeds', async () => {
    const result = await deserialize(ValidatedSetDto, { items: ['ab', 'cd', 'ef'] });
    expect(result.items).toBeInstanceOf(Set);
    expect(result.items.size).toBe(3);
  });

  it('each element validation failure → error', async () => {
    await expect(
      deserialize(ValidatedSetDto, { items: ['ok', 'x'] }),
    ).rejects.toThrow();
  });
});

// ─── Optional / Nullable ────────────────────────────────────────────────────

describe('Optional Set', () => {
  it('undefined → field absent', async () => {
    const result = await deserialize(OptionalSetDto, {});
    expect(result.tags).toBeUndefined();
  });

  it('value present → Set conversion', async () => {
    const result = await deserialize(OptionalSetDto, { tags: ['a'] });
    expect(result.tags).toBeInstanceOf(Set);
  });
});

describe('Nullable Map', () => {
  it('null → null assigned', async () => {
    const result = await deserialize(NullableMapDto, { data: null });
    expect(result.data).toBeNull();
  });

  it('object → Map conversion', async () => {
    const result = await deserialize(NullableMapDto, { data: { x: 1 } });
    expect(result.data).toBeInstanceOf(Map);
  });
});

// ─── JSON Schema ────────────────────────────────────────────────────────────

describe('Collection JSON Schema', () => {
  it('Set → { type: "array", uniqueItems: true }', () => {
    const schema = toJsonSchema(PrimitiveSetDto);
    expect(schema.properties!['tags']).toEqual({
      type: 'array',
      uniqueItems: true,
    });
  });

  it('Set<DTO> → { type: "array", uniqueItems: true, items: { $ref } }', () => {
    const schema = toJsonSchema(NestedSetDto);
    const tagsProp = schema.properties!['tags'] as any;
    expect(tagsProp.type).toBe('array');
    expect(tagsProp.uniqueItems).toBe(true);
    expect(tagsProp.items.$ref).toContain('TagDto');
  });

  it('Map → { type: "object" }', () => {
    const schema = toJsonSchema(PrimitiveMapDto);
    expect(schema.properties!['config']).toEqual({
      type: 'object',
    });
  });

  it('Map<string, DTO> → { type: "object", additionalProperties: { $ref } }', () => {
    const schema = toJsonSchema(NestedMapDto);
    const pricesProp = schema.properties!['prices'] as any;
    expect(pricesProp.type).toBe('object');
    expect(pricesProp.additionalProperties.$ref).toContain('PriceDto');
  });
});

// ─── Edge Cases ─────────────────────────────────────────────────────────────

describe('Set — duplicate value handling', () => {
  it('input array with duplicates → Set auto-deduplicates', async () => {
    const result = await deserialize(PrimitiveSetDto, { tags: ['a', 'b', 'a', 'c', 'b'] });
    expect(result.tags).toBeInstanceOf(Set);
    expect(result.tags.size).toBe(3);
    expect([...result.tags]).toEqual(['a', 'b', 'c']);
  });
});

describe('Set<DTO> — null elements', () => {
  it('null element in array → nested deserialize error', async () => {
    await expect(
      deserialize(NestedSetDto, { tags: [{ name: 'ok' }, null] }),
    ).rejects.toThrow();
  });
});

describe('Map<string, DTO> — null value', () => {
  it('null Map value → nested deserialize error', async () => {
    await expect(
      deserialize(NestedMapDto, { prices: { USD: { amount: 100 }, KRW: null } }),
    ).rejects.toThrow();
  });
});

describe('empty collection serialize', () => {
  it('empty Set → empty array', async () => {
    const dto = Object.assign(new PrimitiveSetDto(), { tags: new Set() });
    const result = await serialize(dto);
    expect(result['tags']).toEqual([]);
  });

  it('empty Map → empty object', async () => {
    const dto = Object.assign(new PrimitiveMapDto(), { config: new Map() });
    const result = await serialize(dto);
    expect(result['config']).toEqual({});
  });
});

describe('Set<DTO> serialize — null elements', () => {
  it('null element in Set → null preserved', async () => {
    const tag = Object.assign(new TagDto(), { name: 'a' });
    const dto = Object.assign(new NestedSetDto(), { tags: new Set([tag, null as any]) });
    const result = await serialize(dto);
    const arr = result['tags'] as any[];
    expect(arr).toHaveLength(2);
    expect(arr[0]).toEqual({ name: 'a' });
    expect(arr[1]).toBeNull();
  });
});

describe('Map — prototype pollution prevention', () => {
  it('Object.create(null) input → normal conversion', async () => {
    const input = Object.create(null);
    input.key1 = 'val1';
    const result = await deserialize(PrimitiveMapDto, { config: input });
    expect(result.config).toBeInstanceOf(Map);
    expect(result.config.get('key1')).toBe('val1');
  });

  it('inherited properties not included in Map', async () => {
    const proto = { inherited: 'should-not-appear' };
    const input = Object.create(proto);
    input.own = 'visible';
    const result = await deserialize(PrimitiveMapDto, { config: input });
    expect(result.config.has('own')).toBe(true);
    expect(result.config.has('inherited')).toBe(false);
  });
});

describe('stopAtFirstError — collection', () => {
  afterEach(() => unseal());

  it('Set<DTO> stopAtFirstError → only first error returned', async () => {
    configure({ stopAtFirstError: true });

    class StopSetDto {
      @Field({ type: () => Set as any, setValue: () => TagDto })
      items!: Set<TagDto>;
    }

    try {
      await deserialize(StopSetDto, {
        items: [{ name: '' }, { name: '' }, { name: '' }],
      });
      expect.unreachable('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(BakerValidationError);
      // stopAtFirstError: only 1 error
      expect(e.errors.length).toBe(1);
      expect(e.errors[0].path).toContain('[0]');
    }
  });

  it('Map<string, DTO> stopAtFirstError → only first error returned', async () => {
    configure({ stopAtFirstError: true });

    class StopMapDto {
      @Field({ type: () => Map as any, mapValue: () => PriceDto })
      data!: Map<string, PriceDto>;
    }

    try {
      await deserialize(StopMapDto, {
        data: { a: { amount: 'bad' }, b: { amount: 'bad' } },
      });
      expect.unreachable('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(BakerValidationError);
      expect(e.errors.length).toBe(1);
    }
  });
});

describe('collectErrors — collection', () => {
  it('Set<DTO> all errors collected', async () => {
    try {
      await deserialize(NestedSetDto, {
        tags: [{ name: '' }, { name: '' }],
      });
      expect.unreachable('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(BakerValidationError);
      // both elements have errors
      expect(e.errors.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('Map<string, DTO> all errors collected', async () => {
    try {
      await deserialize(NestedMapDto, {
        prices: { USD: { amount: 'x' }, EUR: { amount: 'y' } },
      });
      expect.unreachable('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(BakerValidationError);
      expect(e.errors.length).toBeGreaterThanOrEqual(2);
      // each key path included
      const paths = e.errors.map((e: any) => e.path);
      expect(paths.some((p: string) => p.includes('USD'))).toBe(true);
      expect(paths.some((p: string) => p.includes('EUR'))).toBe(true);
    }
  });
});
