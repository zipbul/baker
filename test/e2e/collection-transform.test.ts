import { describe, it, expect, afterEach, beforeEach } from 'bun:test';

import { Field, Recipe, deserialize, serialize, configure, isBakerError, seal } from '../../index';
import { arrayOf } from '../../src/decorators/field';
import { isString, isNumber, minLength } from '../../src/rules/index';
import { assertBakerError } from '../integration/helpers/assert';
import { sealClass } from '../integration/helpers/seal';
import { unseal } from '../integration/helpers/unseal';

beforeEach(() => unseal());
afterEach(() => unseal());

// ─── DTOs ────────────────────────────────────────────────────────────────────

// Set<primitive>
@Recipe
class PrimitiveSetDto {
  @Field({ type: () => Set })
  tags!: Set<string>;
}

// Set<DTO>
@Recipe
class TagDto {
  @Field(isString, minLength(1))
  name!: string;
}

@Recipe
class NestedSetDto {
  @Field({ type: () => Set, setValue: () => TagDto })
  tags!: Set<TagDto>;
}

// Map<string, primitive>
@Recipe
class PrimitiveMapDto {
  @Field({ type: () => Map })
  config!: Map<string, unknown>;
}

// Map<string, DTO>
@Recipe
class PriceDto {
  @Field(isNumber())
  amount!: number;
}

@Recipe
class NestedMapDto {
  @Field({ type: () => Map, mapValue: () => PriceDto })
  prices!: Map<string, PriceDto>;
}

// Set with validation rules
@Recipe
class ValidatedSetDto {
  @Field(arrayOf(isString, minLength(2)), { type: () => Set })
  items!: Set<string>;
}

// Optional/nullable collection
@Recipe
class OptionalSetDto {
  @Field({ type: () => Set, optional: true })
  tags?: Set<string>;
}

@Recipe
class NullableMapDto {
  @Field({ type: () => Map, nullable: true })
  data!: Map<string, unknown> | null;
}

// ─── Set<primitive> ──────────────────────────────────────────────────────────

describe('Set<primitive> — deserialize', () => {
  it('array → Set conversion', async () => {
    seal();
    const result = (await deserialize(PrimitiveSetDto, { tags: ['a', 'b', 'c'] })) as PrimitiveSetDto;
    expect(result.tags).toBeInstanceOf(Set);
    expect([...result.tags]).toEqual(['a', 'b', 'c']);
  });

  it('empty array → empty Set', async () => {
    seal();
    const result = (await deserialize(PrimitiveSetDto, { tags: [] })) as PrimitiveSetDto;
    expect(result.tags).toBeInstanceOf(Set);
    expect(result.tags.size).toBe(0);
  });

  it('non-array input → error', async () => {
    seal();
    expect(isBakerError(await deserialize(PrimitiveSetDto, { tags: 'not-array' }))).toBe(true);
  });
});

describe('Set<primitive> — serialize', () => {
  it('Set → array conversion', async () => {
    seal();
    const dto = Object.assign(new PrimitiveSetDto(), { tags: new Set(['x', 'y']) });
    const result = await serialize(dto);
    expect(result['tags']).toEqual(['x', 'y']);
  });
});

// ─── Set<DTO> ────────────────────────────────────────────────────────────────

describe('Set<DTO> — deserialize', () => {
  it('array of objects → Set of DTO instances', async () => {
    seal();
    const result = (await deserialize(NestedSetDto, {
      tags: [{ name: 'alpha' }, { name: 'beta' }],
    })) as NestedSetDto;
    expect(result.tags).toBeInstanceOf(Set);
    expect(result.tags.size).toBe(2);
    const arr = [...result.tags];
    expect(arr[0]).toBeInstanceOf(TagDto);
    expect(arr[0]!.name).toBe('alpha');
    expect(arr[1]!.name).toBe('beta');
  });

  it('nested DTO validation failure → error with index path', async () => {
    seal();
    const result = await deserialize(NestedSetDto, {
      tags: [{ name: 'ok' }, { name: '' }],
    });
    assertBakerError(result);
    expect(result.errors.length).toBeGreaterThan(0);
    const err = result.errors.find(e => e.path.includes('[1]'));
    expect(err).toBeDefined();
  });
});

describe('Set<DTO> — serialize', () => {
  it('Set of DTO → array of plain objects', async () => {
    seal();
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
    seal();
    const result = (await deserialize(PrimitiveMapDto, { config: { key1: 'val1', key2: 42 } })) as PrimitiveMapDto;
    expect(result.config).toBeInstanceOf(Map);
    expect(result.config.get('key1')).toBe('val1');
    expect(result.config.get('key2')).toBe(42);
  });

  it('empty object → empty Map', async () => {
    seal();
    const result = (await deserialize(PrimitiveMapDto, { config: {} })) as PrimitiveMapDto;
    expect(result.config).toBeInstanceOf(Map);
    expect(result.config.size).toBe(0);
  });

  it('array input → error', async () => {
    seal();
    expect(isBakerError(await deserialize(PrimitiveMapDto, { config: [1, 2] }))).toBe(true);
  });

  it('null input → error', async () => {
    seal();
    expect(isBakerError(await deserialize(PrimitiveMapDto, { config: null }))).toBe(true);
  });
});

describe('Map<string, primitive> — serialize', () => {
  it('Map → plain object conversion', async () => {
    seal();
    const map = new Map<string, unknown>([
      ['a', 1],
      ['b', 'two'],
    ]);
    const dto = Object.assign(new PrimitiveMapDto(), { config: map });
    const result = await serialize(dto);
    expect(result['config']).toEqual({ a: 1, b: 'two' });
  });
});

// ─── Map<string, DTO> ──────────────────────────────────────────────────────

describe('Map<string, DTO> — deserialize', () => {
  it('plain object → Map of DTO instances', async () => {
    seal();
    const result = (await deserialize(NestedMapDto, {
      prices: { USD: { amount: 100 }, KRW: { amount: 130000 } },
    })) as NestedMapDto;
    expect(result.prices).toBeInstanceOf(Map);
    expect(result.prices.size).toBe(2);
    expect(result.prices.get('USD')).toBeInstanceOf(PriceDto);
    expect(result.prices.get('USD')!.amount).toBe(100);
    expect(result.prices.get('KRW')!.amount).toBe(130000);
  });

  it('nested DTO validation failure → error with key path', async () => {
    seal();
    const result = await deserialize(NestedMapDto, {
      prices: { USD: { amount: 100 }, KRW: { amount: 'bad' } },
    });
    assertBakerError(result);
    expect(result.errors.length).toBeGreaterThan(0);
    const err = result.errors.find(e => e.path.includes('KRW'));
    expect(err).toBeDefined();
  });
});

describe('Map<string, DTO> — serialize', () => {
  it('Map of DTO → plain object of plain objects', async () => {
    seal();
    const usd = Object.assign(new PriceDto(), { amount: 50 });
    const eur = Object.assign(new PriceDto(), { amount: 45 });
    const map = new Map([
      ['USD', usd],
      ['EUR', eur],
    ]);
    const dto = Object.assign(new NestedMapDto(), { prices: map });
    const result = await serialize(dto);
    expect(result['prices']).toEqual({ USD: { amount: 50 }, EUR: { amount: 45 } });
  });
});

// ─── Set with validation ─────────────────────────────────────────────────────

describe('Set with each validation', () => {
  it('each element validation succeeds', async () => {
    seal();
    const result = (await deserialize(ValidatedSetDto, { items: ['ab', 'cd', 'ef'] })) as ValidatedSetDto;
    expect(result.items).toBeInstanceOf(Set);
    expect(result.items.size).toBe(3);
  });

  it('each element validation failure → error', async () => {
    seal();
    expect(isBakerError(await deserialize(ValidatedSetDto, { items: ['ok', 'x'] }))).toBe(true);
  });
});

// ─── Optional / Nullable ────────────────────────────────────────────────────

describe('Optional Set', () => {
  it('undefined → field absent', async () => {
    seal();
    const result = (await deserialize(OptionalSetDto, {})) as OptionalSetDto;
    expect(result.tags).toBeUndefined();
  });

  it('value present → Set conversion', async () => {
    seal();
    const result = (await deserialize(OptionalSetDto, { tags: ['a'] })) as OptionalSetDto;
    expect(result.tags).toBeInstanceOf(Set);
  });
});

describe('Nullable Map', () => {
  it('null → null assigned', async () => {
    seal();
    const result = (await deserialize(NullableMapDto, { data: null })) as NullableMapDto;
    expect(result.data).toBeNull();
  });

  it('object → Map conversion', async () => {
    seal();
    const result = (await deserialize(NullableMapDto, { data: { x: 1 } })) as NullableMapDto;
    expect(result.data).toBeInstanceOf(Map);
  });
});

// ─── Edge Cases ─────────────────────────────────────────────────────────────

describe('Set — duplicate value handling', () => {
  it('input array with duplicates → Set auto-deduplicates', async () => {
    seal();
    const result = (await deserialize(PrimitiveSetDto, { tags: ['a', 'b', 'a', 'c', 'b'] })) as PrimitiveSetDto;
    expect(result.tags).toBeInstanceOf(Set);
    expect(result.tags.size).toBe(3);
    expect([...result.tags]).toEqual(['a', 'b', 'c']);
  });
});

describe('Set<DTO> — null elements', () => {
  it('null element in array → nested deserialize error', async () => {
    seal();
    expect(isBakerError(await deserialize(NestedSetDto, { tags: [{ name: 'ok' }, null] }))).toBe(true);
  });
});

describe('Map<string, DTO> — null value', () => {
  it('null Map value → nested deserialize error', async () => {
    seal();
    expect(isBakerError(await deserialize(NestedMapDto, { prices: { USD: { amount: 100 }, KRW: null } }))).toBe(true);
  });
});

describe('empty collection serialize', () => {
  it('empty Set → empty array', async () => {
    seal();
    const dto = Object.assign(new PrimitiveSetDto(), { tags: new Set() });
    const result = await serialize(dto);
    expect(result['tags']).toEqual([]);
  });

  it('empty Map → empty object', async () => {
    seal();
    const dto = Object.assign(new PrimitiveMapDto(), { config: new Map() });
    const result = await serialize(dto);
    expect(result['config']).toEqual({});
  });
});

describe('Set<DTO> serialize — null elements', () => {
  it('null element in Set → null preserved', async () => {
    seal();
    const tag = Object.assign(new TagDto(), { name: 'a' });
    const dto = Object.assign(new NestedSetDto(), { tags: new Set<TagDto | null>([tag, null]) });
    const result = await serialize(dto);
    const arr = result['tags'] as unknown[];
    expect(arr).toHaveLength(2);
    expect(arr[0]).toEqual({ name: 'a' });
    expect(arr[1]).toBeNull();
  });
});

describe('Map — prototype pollution prevention', () => {
  it('Object.create(null) input → normal conversion', async () => {
    seal();
    const input = Object.create(null);
    input.key1 = 'val1';
    const result = (await deserialize(PrimitiveMapDto, { config: input })) as PrimitiveMapDto;
    expect(result.config).toBeInstanceOf(Map);
    expect(result.config.get('key1')).toBe('val1');
  });

  it('inherited properties not included in Map', async () => {
    seal();
    const proto = { inherited: 'should-not-appear' };
    const input = Object.create(proto);
    input.own = 'visible';
    const result = (await deserialize(PrimitiveMapDto, { config: input })) as PrimitiveMapDto;
    expect(result.config.has('own')).toBe(true);
    expect(result.config.has('inherited')).toBe(false);
  });
});

describe('stopAtFirstError — collection', () => {
  afterEach(() => unseal());

  it('Set<DTO> stopAtFirstError → only first error returned', async () => {
    configure({ stopAtFirstError: true });

    @Recipe
    class StopSetDto {
      @Field({ type: () => Set, setValue: () => TagDto })
      items!: Set<TagDto>;
    }
    sealClass(StopSetDto);

    const result = await deserialize(StopSetDto, {
      items: [{ name: '' }, { name: '' }, { name: '' }],
    });
    assertBakerError(result);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]!.path).toContain('[0]');
  });

  it('Map<string, DTO> stopAtFirstError → only first error returned', async () => {
    configure({ stopAtFirstError: true });
    seal();

    @Recipe
    class StopMapDto {
      @Field({ type: () => Map, mapValue: () => PriceDto })
      data!: Map<string, PriceDto>;
    }
    sealClass(StopMapDto);

    const result = await deserialize(StopMapDto, {
      data: { a: { amount: 'bad' }, b: { amount: 'bad' } },
    });
    assertBakerError(result);
    expect(result.errors.length).toBe(1);
  });
});

describe('collectErrors — collection', () => {
  it('Set<DTO> all errors collected', async () => {
    seal();
    const result = await deserialize(NestedSetDto, {
      tags: [{ name: '' }, { name: '' }],
    });
    assertBakerError(result);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('Map<string, DTO> all errors collected', async () => {
    seal();
    const result = await deserialize(NestedMapDto, {
      prices: { USD: { amount: 'x' }, EUR: { amount: 'y' } },
    });
    assertBakerError(result);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    const paths = result.errors.map(e => e.path);
    expect(paths.some(p => p.includes('USD'))).toBe(true);
    expect(paths.some(p => p.includes('EUR'))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// W8: Map non-string key → throws TypeError at serialize
// ─────────────────────────────────────────────────────────────────────────────

describe('Map non-string key throws at serialize', () => {
  @Recipe
  class MapItemDto {
    @Field(isString) v!: string;
  }
  @Recipe
  class NonStringKeyMapDto {
    @Field({ type: () => Map, setValue: () => MapItemDto })
    entries!: Map<unknown, MapItemDto>;
  }

  it('number key in Map throws TypeError', () => {
    seal();
    const m = new Map<unknown, MapItemDto>();
    m.set(1, Object.assign(new MapItemDto(), { v: 'a' }));
    const dto = Object.assign(new NonStringKeyMapDto(), { entries: m });
    expect(() => serialize(dto)).toThrow(/non-string key/);
  });

  it('object key in Map throws TypeError', () => {
    seal();
    const m = new Map<unknown, MapItemDto>();
    m.set({}, Object.assign(new MapItemDto(), { v: 'a' }));
    const dto = Object.assign(new NonStringKeyMapDto(), { entries: m });
    expect(() => serialize(dto)).toThrow(/non-string key/);
  });
});

describe('primitive Map non-string key throws at serialize', () => {
  @Recipe
  class PrimMapDto {
    @Field({ type: () => Map })
    m!: Map<unknown, string>;
  }

  it('number key in primitive Map throws TypeError', () => {
    seal();
    const m = new Map<unknown, string>();
    m.set(1, 'a');
    const dto = Object.assign(new PrimMapDto(), { m });
    expect(() => serialize(dto)).toThrow(/non-string key/);
  });

  it('string key in primitive Map serializes successfully', () => {
    seal();
    const m = new Map<unknown, string>();
    m.set('a', 'x');
    m.set('b', 'y');
    const dto = Object.assign(new PrimMapDto(), { m });
    const out = serialize(dto) as Record<string, unknown>;
    expect(out.m).toEqual({ a: 'x', b: 'y' });
  });
});
