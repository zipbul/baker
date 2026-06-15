import { describe, it, expect } from 'bun:test';

import { Baker, Field, isBakerIssueSet } from '../../index';
import { arrayOf } from '../../src/decorators/field';
import { isString, isNumber, minLength } from '../../src/rules/index';
import { assertBakerIssueSet } from '../integration/helpers/assert';

const baker = new Baker();

// ─── DTOs ────────────────────────────────────────────────────────────────────

// Set<primitive>
@baker.Recipe
class PrimitiveSetDto {
  @Field({ type: () => Set })
  tags!: Set<string>;
}

// Set<DTO>
@baker.Recipe
class TagDto {
  @Field(isString, minLength(1))
  name!: string;
}

@baker.Recipe
class NestedSetDto {
  @Field({ type: () => Set, setValue: () => TagDto })
  tags!: Set<TagDto>;
}

// Map<string, primitive>
@baker.Recipe
class PrimitiveMapDto {
  @Field({ type: () => Map })
  config!: Map<string, unknown>;
}

// Map<string, DTO>
@baker.Recipe
class PriceDto {
  @Field(isNumber())
  amount!: number;
}

@baker.Recipe
class NestedMapDto {
  @Field({ type: () => Map, mapValue: () => PriceDto })
  prices!: Map<string, PriceDto>;
}

// Set with validation rules
@baker.Recipe
class ValidatedSetDto {
  @Field(arrayOf(isString, minLength(2)), { type: () => Set })
  items!: Set<string>;
}

// Optional/nullable collection
@baker.Recipe
class OptionalSetDto {
  @Field({ type: () => Set, optional: true })
  tags?: Set<string>;
}

@baker.Recipe
class NullableMapDto {
  @Field({ type: () => Map, nullable: true })
  data!: Map<string, unknown> | null;
}

baker.seal();

// ─── Set<primitive> ──────────────────────────────────────────────────────────

describe('Set<primitive> — deserialize', () => {
  it('array → Set conversion', async () => {
    const result = (await baker.deserialize(PrimitiveSetDto, { tags: ['a', 'b', 'c'] })) as PrimitiveSetDto;
    expect(result.tags).toBeInstanceOf(Set);
    expect([...result.tags]).toEqual(['a', 'b', 'c']);
  });

  it('empty array → empty Set', async () => {
    const result = (await baker.deserialize(PrimitiveSetDto, { tags: [] })) as PrimitiveSetDto;
    expect(result.tags).toBeInstanceOf(Set);
    expect(result.tags.size).toBe(0);
  });

  it('non-array input → error', async () => {
    expect(isBakerIssueSet(await baker.deserialize(PrimitiveSetDto, { tags: 'not-array' }))).toBe(true);
  });
});

describe('Set<primitive> — serialize', () => {
  it('Set → array conversion', async () => {
    const dto = Object.assign(new PrimitiveSetDto(), { tags: new Set(['x', 'y']) });
    const result = await baker.serialize(dto);
    expect(result['tags']).toEqual(['x', 'y']);
  });
});

// ─── Set<DTO> ────────────────────────────────────────────────────────────────

describe('Set<DTO> — deserialize', () => {
  it('array of objects → Set of DTO instances', async () => {
    const result = (await baker.deserialize(NestedSetDto, {
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
    const result = await baker.deserialize(NestedSetDto, {
      tags: [{ name: 'ok' }, { name: '' }],
    });
    assertBakerIssueSet(result);
    expect(result.errors.length).toBeGreaterThan(0);
    const err = result.errors.find(e => e.path.includes('[1]'));
    expect(err).toBeDefined();
  });
});

describe('Set<DTO> — serialize', () => {
  it('Set of DTO → array of plain objects', async () => {
    const tag1 = Object.assign(new TagDto(), { name: 'a' });
    const tag2 = Object.assign(new TagDto(), { name: 'b' });
    const dto = Object.assign(new NestedSetDto(), { tags: new Set([tag1, tag2]) });
    const result = await baker.serialize(dto);
    expect(result['tags']).toEqual([{ name: 'a' }, { name: 'b' }]);
  });
});

// ─── Map<string, primitive> ─────────────────────────────────────────────────

describe('Map<string, primitive> — deserialize', () => {
  it('plain object → Map conversion', async () => {
    const result = (await baker.deserialize(PrimitiveMapDto, { config: { key1: 'val1', key2: 42 } })) as PrimitiveMapDto;
    expect(result.config).toBeInstanceOf(Map);
    expect(result.config.get('key1')).toBe('val1');
    expect(result.config.get('key2')).toBe(42);
  });

  it('empty object → empty Map', async () => {
    const result = (await baker.deserialize(PrimitiveMapDto, { config: {} })) as PrimitiveMapDto;
    expect(result.config).toBeInstanceOf(Map);
    expect(result.config.size).toBe(0);
  });

  it('array input → error', async () => {
    expect(isBakerIssueSet(await baker.deserialize(PrimitiveMapDto, { config: [1, 2] }))).toBe(true);
  });

  it('null input → error', async () => {
    expect(isBakerIssueSet(await baker.deserialize(PrimitiveMapDto, { config: null }))).toBe(true);
  });
});

describe('Map<string, primitive> — serialize', () => {
  it('Map → plain object conversion', async () => {
    const map = new Map<string, unknown>([
      ['a', 1],
      ['b', 'two'],
    ]);
    const dto = Object.assign(new PrimitiveMapDto(), { config: map });
    const result = await baker.serialize(dto);
    expect(result['config']).toEqual({ a: 1, b: 'two' });
  });
});

// ─── Map<string, DTO> ──────────────────────────────────────────────────────

describe('Map<string, DTO> — deserialize', () => {
  it('plain object → Map of DTO instances', async () => {
    const result = (await baker.deserialize(NestedMapDto, {
      prices: { USD: { amount: 100 }, KRW: { amount: 130000 } },
    })) as NestedMapDto;
    expect(result.prices).toBeInstanceOf(Map);
    expect(result.prices.size).toBe(2);
    expect(result.prices.get('USD')).toBeInstanceOf(PriceDto);
    expect(result.prices.get('USD')!.amount).toBe(100);
    expect(result.prices.get('KRW')!.amount).toBe(130000);
  });

  it('nested DTO validation failure → error with key path', async () => {
    const result = await baker.deserialize(NestedMapDto, {
      prices: { USD: { amount: 100 }, KRW: { amount: 'bad' } },
    });
    assertBakerIssueSet(result);
    expect(result.errors.length).toBeGreaterThan(0);
    const err = result.errors.find(e => e.path.includes('KRW'));
    expect(err).toBeDefined();
  });
});

describe('Map<string, DTO> — serialize', () => {
  it('Map of DTO → plain object of plain objects', async () => {
    const usd = Object.assign(new PriceDto(), { amount: 50 });
    const eur = Object.assign(new PriceDto(), { amount: 45 });
    const map = new Map([
      ['USD', usd],
      ['EUR', eur],
    ]);
    const dto = Object.assign(new NestedMapDto(), { prices: map });
    const result = await baker.serialize(dto);
    expect(result['prices']).toEqual({ USD: { amount: 50 }, EUR: { amount: 45 } });
  });
});

// ─── Set with validation ─────────────────────────────────────────────────────

describe('Set with each validation', () => {
  it('each element validation succeeds', async () => {
    const result = (await baker.deserialize(ValidatedSetDto, { items: ['ab', 'cd', 'ef'] })) as ValidatedSetDto;
    expect(result.items).toBeInstanceOf(Set);
    expect(result.items.size).toBe(3);
  });

  it('each element validation failure → error', async () => {
    expect(isBakerIssueSet(await baker.deserialize(ValidatedSetDto, { items: ['ok', 'x'] }))).toBe(true);
  });
});

// ─── Optional / Nullable ────────────────────────────────────────────────────

describe('Optional Set', () => {
  it('undefined → field absent', async () => {
    const result = (await baker.deserialize(OptionalSetDto, {})) as OptionalSetDto;
    expect(result.tags).toBeUndefined();
  });

  it('value present → Set conversion', async () => {
    const result = (await baker.deserialize(OptionalSetDto, { tags: ['a'] })) as OptionalSetDto;
    expect(result.tags).toBeInstanceOf(Set);
  });
});

describe('Nullable Map', () => {
  it('null → null assigned', async () => {
    const result = (await baker.deserialize(NullableMapDto, { data: null })) as NullableMapDto;
    expect(result.data).toBeNull();
  });

  it('object → Map conversion', async () => {
    const result = (await baker.deserialize(NullableMapDto, { data: { x: 1 } })) as NullableMapDto;
    expect(result.data).toBeInstanceOf(Map);
  });
});

// ─── Edge Cases ─────────────────────────────────────────────────────────────

describe('Set — duplicate value handling', () => {
  it('input array with duplicates → Set auto-deduplicates', async () => {
    const result = (await baker.deserialize(PrimitiveSetDto, { tags: ['a', 'b', 'a', 'c', 'b'] })) as PrimitiveSetDto;
    expect(result.tags).toBeInstanceOf(Set);
    expect(result.tags.size).toBe(3);
    expect([...result.tags]).toEqual(['a', 'b', 'c']);
  });
});

describe('Set<DTO> — null elements', () => {
  it('null element in array → nested deserialize error', async () => {
    expect(isBakerIssueSet(await baker.deserialize(NestedSetDto, { tags: [{ name: 'ok' }, null] }))).toBe(true);
  });
});

describe('Map<string, DTO> — null value', () => {
  it('null Map value → nested deserialize error', async () => {
    expect(isBakerIssueSet(await baker.deserialize(NestedMapDto, { prices: { USD: { amount: 100 }, KRW: null } }))).toBe(true);
  });
});

describe('empty collection serialize', () => {
  it('empty Set → empty array', async () => {
    const dto = Object.assign(new PrimitiveSetDto(), { tags: new Set() });
    const result = await baker.serialize(dto);
    expect(result['tags']).toEqual([]);
  });

  it('empty Map → empty object', async () => {
    const dto = Object.assign(new PrimitiveMapDto(), { config: new Map() });
    const result = await baker.serialize(dto);
    expect(result['config']).toEqual({});
  });
});

describe('Set<DTO> serialize — null elements', () => {
  it('null element in Set → null preserved', async () => {
    const tag = Object.assign(new TagDto(), { name: 'a' });
    const dto = Object.assign(new NestedSetDto(), { tags: new Set<TagDto | null>([tag, null]) });
    const result = await baker.serialize(dto);
    const arr = result['tags'] as unknown[];
    expect(arr).toHaveLength(2);
    expect(arr[0]).toEqual({ name: 'a' });
    expect(arr[1]).toBeNull();
  });
});

describe('Map — prototype pollution prevention', () => {
  it('Object.create(null) input → normal conversion', async () => {
    const input = Object.create(null);
    input.key1 = 'val1';
    const result = (await baker.deserialize(PrimitiveMapDto, { config: input })) as PrimitiveMapDto;
    expect(result.config).toBeInstanceOf(Map);
    expect(result.config.get('key1')).toBe('val1');
  });

  it('inherited properties not included in Map', async () => {
    const proto = { inherited: 'should-not-appear' };
    const input = Object.create(proto);
    input.own = 'visible';
    const result = (await baker.deserialize(PrimitiveMapDto, { config: input })) as PrimitiveMapDto;
    expect(result.config.has('own')).toBe(true);
    expect(result.config.has('inherited')).toBe(false);
  });
});

describe('stopAtFirstError — collection', () => {
  it('Set<DTO> stopAtFirstError → only first error returned', async () => {
    const b = new Baker({ stopAtFirstError: true });

    @b.Recipe
    class StopTagDto {
      @Field(isString, minLength(1))
      name!: string;
    }

    @b.Recipe
    class StopSetDto {
      @Field({ type: () => Set, setValue: () => StopTagDto })
      items!: Set<StopTagDto>;
    }
    b.seal();

    const result = await b.deserialize(StopSetDto, {
      items: [{ name: '' }, { name: '' }, { name: '' }],
    });
    assertBakerIssueSet(result);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]!.path).toContain('[0]');
  });

  it('Map<string, DTO> stopAtFirstError → only first error returned', async () => {
    const b = new Baker({ stopAtFirstError: true });

    @b.Recipe
    class StopPriceDto {
      @Field(isNumber())
      amount!: number;
    }

    @b.Recipe
    class StopMapDto {
      @Field({ type: () => Map, mapValue: () => StopPriceDto })
      data!: Map<string, StopPriceDto>;
    }
    b.seal();

    const result = await b.deserialize(StopMapDto, {
      data: { a: { amount: 'bad' }, b: { amount: 'bad' } },
    });
    assertBakerIssueSet(result);
    expect(result.errors.length).toBe(1);
  });
});

describe('collectErrors — collection', () => {
  it('Set<DTO> all errors collected', async () => {
    const result = await baker.deserialize(NestedSetDto, {
      tags: [{ name: '' }, { name: '' }],
    });
    assertBakerIssueSet(result);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('Map<string, DTO> all errors collected', async () => {
    const result = await baker.deserialize(NestedMapDto, {
      prices: { USD: { amount: 'x' }, EUR: { amount: 'y' } },
    });
    assertBakerIssueSet(result);
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
  const w8 = new Baker();
  @w8.Recipe
  class MapItemDto {
    @Field(isString) v!: string;
  }
  @w8.Recipe
  class NonStringKeyMapDto {
    @Field({ type: () => Map, setValue: () => MapItemDto })
    entries!: Map<unknown, MapItemDto>;
  }
  w8.seal();

  it('number key in Map throws TypeError', () => {
    const m = new Map<unknown, MapItemDto>();
    m.set(1, Object.assign(new MapItemDto(), { v: 'a' }));
    const dto = Object.assign(new NonStringKeyMapDto(), { entries: m });
    expect(() => w8.serialize(dto)).toThrow(/non-string key/);
  });

  it('object key in Map throws TypeError', () => {
    const m = new Map<unknown, MapItemDto>();
    m.set({}, Object.assign(new MapItemDto(), { v: 'a' }));
    const dto = Object.assign(new NonStringKeyMapDto(), { entries: m });
    expect(() => w8.serialize(dto)).toThrow(/non-string key/);
  });
});

describe('primitive Map non-string key throws at serialize', () => {
  const pm = new Baker();
  @pm.Recipe
  class PrimMapDto {
    @Field({ type: () => Map })
    m!: Map<unknown, string>;
  }
  pm.seal();

  it('number key in primitive Map throws TypeError', () => {
    const m = new Map<unknown, string>();
    m.set(1, 'a');
    const dto = Object.assign(new PrimMapDto(), { m });
    expect(() => pm.serialize(dto)).toThrow(/non-string key/);
  });

  it('string key in primitive Map serializes successfully', () => {
    const m = new Map<unknown, string>();
    m.set('a', 'x');
    m.set('b', 'y');
    const dto = Object.assign(new PrimMapDto(), { m });
    const out = pm.serialize(dto) as Record<string, unknown>;
    expect(out.m).toEqual({ a: 'x', b: 'y' });
  });
});
