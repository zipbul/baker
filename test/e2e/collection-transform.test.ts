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
  it('array → Set 변환', async () => {
    const result = await deserialize(PrimitiveSetDto, { tags: ['a', 'b', 'c'] });
    expect(result.tags).toBeInstanceOf(Set);
    expect([...result.tags]).toEqual(['a', 'b', 'c']);
  });

  it('빈 배열 → 빈 Set', async () => {
    const result = await deserialize(PrimitiveSetDto, { tags: [] });
    expect(result.tags).toBeInstanceOf(Set);
    expect(result.tags.size).toBe(0);
  });

  it('배열 아닌 입력 → 에러', async () => {
    await expect(
      deserialize(PrimitiveSetDto, { tags: 'not-array' }),
    ).rejects.toThrow();
  });
});

describe('Set<primitive> — serialize', () => {
  it('Set → array 변환', async () => {
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

  it('nested DTO 검증 실패 → 에러에 인덱스 경로 포함', async () => {
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
  it('plain object → Map 변환', async () => {
    const result = await deserialize(PrimitiveMapDto, { config: { key1: 'val1', key2: 42 } });
    expect(result.config).toBeInstanceOf(Map);
    expect(result.config.get('key1')).toBe('val1');
    expect(result.config.get('key2')).toBe(42);
  });

  it('빈 객체 → 빈 Map', async () => {
    const result = await deserialize(PrimitiveMapDto, { config: {} });
    expect(result.config).toBeInstanceOf(Map);
    expect(result.config.size).toBe(0);
  });

  it('배열 입력 → 에러', async () => {
    await expect(
      deserialize(PrimitiveMapDto, { config: [1, 2] }),
    ).rejects.toThrow();
  });

  it('null 입력 → 에러', async () => {
    await expect(
      deserialize(PrimitiveMapDto, { config: null }),
    ).rejects.toThrow();
  });
});

describe('Map<string, primitive> — serialize', () => {
  it('Map → plain object 변환', async () => {
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

  it('nested DTO 검증 실패 → 에러에 key 경로 포함', async () => {
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
  it('각 요소 검증 성공', async () => {
    const result = await deserialize(ValidatedSetDto, { items: ['ab', 'cd', 'ef'] });
    expect(result.items).toBeInstanceOf(Set);
    expect(result.items.size).toBe(3);
  });

  it('각 요소 검증 실패 → 에러', async () => {
    await expect(
      deserialize(ValidatedSetDto, { items: ['ok', 'x'] }),
    ).rejects.toThrow();
  });
});

// ─── Optional / Nullable ────────────────────────────────────────────────────

describe('Optional Set', () => {
  it('undefined → 필드 없음', async () => {
    const result = await deserialize(OptionalSetDto, {});
    expect(result.tags).toBeUndefined();
  });

  it('값 있으면 Set 변환', async () => {
    const result = await deserialize(OptionalSetDto, { tags: ['a'] });
    expect(result.tags).toBeInstanceOf(Set);
  });
});

describe('Nullable Map', () => {
  it('null → null 할당', async () => {
    const result = await deserialize(NullableMapDto, { data: null });
    expect(result.data).toBeNull();
  });

  it('객체 → Map 변환', async () => {
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

describe('Set — 중복 값 처리', () => {
  it('입력 배열 중복 → Set이 자동 중복 제거', async () => {
    const result = await deserialize(PrimitiveSetDto, { tags: ['a', 'b', 'a', 'c', 'b'] });
    expect(result.tags).toBeInstanceOf(Set);
    expect(result.tags.size).toBe(3);
    expect([...result.tags]).toEqual(['a', 'b', 'c']);
  });
});

describe('Set<DTO> — null 요소', () => {
  it('배열에 null 요소 → nested deserialize 시 에러', async () => {
    await expect(
      deserialize(NestedSetDto, { tags: [{ name: 'ok' }, null] }),
    ).rejects.toThrow();
  });
});

describe('Map<string, DTO> — value에 null', () => {
  it('Map value에 null → nested deserialize 에러', async () => {
    await expect(
      deserialize(NestedMapDto, { prices: { USD: { amount: 100 }, KRW: null } }),
    ).rejects.toThrow();
  });
});

describe('빈 컬렉션 serialize', () => {
  it('빈 Set → 빈 배열', async () => {
    const dto = Object.assign(new PrimitiveSetDto(), { tags: new Set() });
    const result = await serialize(dto);
    expect(result['tags']).toEqual([]);
  });

  it('빈 Map → 빈 객체', async () => {
    const dto = Object.assign(new PrimitiveMapDto(), { config: new Map() });
    const result = await serialize(dto);
    expect(result['config']).toEqual({});
  });
});

describe('Set<DTO> serialize — null 요소', () => {
  it('Set에 null 요소 → null 유지', async () => {
    const tag = Object.assign(new TagDto(), { name: 'a' });
    const dto = Object.assign(new NestedSetDto(), { tags: new Set([tag, null as any]) });
    const result = await serialize(dto);
    const arr = result['tags'] as any[];
    expect(arr).toHaveLength(2);
    expect(arr[0]).toEqual({ name: 'a' });
    expect(arr[1]).toBeNull();
  });
});

describe('Map — prototype 오염 방지', () => {
  it('Object.create(null) 입력 → 정상 변환', async () => {
    const input = Object.create(null);
    input.key1 = 'val1';
    const result = await deserialize(PrimitiveMapDto, { config: input });
    expect(result.config).toBeInstanceOf(Map);
    expect(result.config.get('key1')).toBe('val1');
  });

  it('상속된 프로퍼티는 Map에 포함되지 않음', async () => {
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

  it('Set<DTO> stopAtFirstError → 첫 번째 에러만 반환', async () => {
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
      // stopAtFirstError: 에러가 1개만
      expect(e.errors.length).toBe(1);
      expect(e.errors[0].path).toContain('[0]');
    }
  });

  it('Map<string, DTO> stopAtFirstError → 첫 번째 에러만 반환', async () => {
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
  it('Set<DTO> 모든 에러 수집', async () => {
    try {
      await deserialize(NestedSetDto, {
        tags: [{ name: '' }, { name: '' }],
      });
      expect.unreachable('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(BakerValidationError);
      // 2개 요소 모두 에러
      expect(e.errors.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('Map<string, DTO> 모든 에러 수집', async () => {
    try {
      await deserialize(NestedMapDto, {
        prices: { USD: { amount: 'x' }, EUR: { amount: 'y' } },
      });
      expect.unreachable('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(BakerValidationError);
      expect(e.errors.length).toBeGreaterThanOrEqual(2);
      // 각 key 경로 포함
      const paths = e.errors.map((e: any) => e.path);
      expect(paths.some((p: string) => p.includes('USD'))).toBe(true);
      expect(paths.some((p: string) => p.includes('EUR'))).toBe(true);
    }
  });
});
