import { describe, it, expect, afterEach } from 'bun:test';
import { Field, arrayOf, deserialize, configure, BakerValidationError } from '../../index';
import { isArray, isString, isNumber, min, minLength, arrayMinSize } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class StringArrayDto {
  @Field(isArray, arrayOf(isString))
  tags!: string[];
}

class NumberArrayDto {
  @Field(isArray, arrayOf(isNumber(), min(0)))
  scores!: number[];
}

class MinLenArrayDto {
  @Field(isArray, arrayMinSize(1), arrayOf(isString, minLength(2)))
  names!: string[];
}

// ─────────────────────────────────────────────────────────────────────────────

describe('each:true — type validation', () => {
  it('all elements string → passes', async () => {
    const r = await deserialize<StringArrayDto>(StringArrayDto, { tags: ['a', 'b', 'c'] });
    expect(r.tags).toEqual(['a', 'b', 'c']);
  });

  it('non-string element → rejected', async () => {
    await expect(
      deserialize(StringArrayDto, { tags: ['a', 123, 'c'] }),
    ).rejects.toThrow(BakerValidationError);
  });

  it('empty array → passes (each is per-element, no elements to validate)', async () => {
    const r = await deserialize<StringArrayDto>(StringArrayDto, { tags: [] });
    expect(r.tags).toEqual([]);
  });
});

describe('each:true — constraint validation', () => {
  it('all elements pass Min', async () => {
    const r = await deserialize<NumberArrayDto>(NumberArrayDto, { scores: [0, 5, 10] });
    expect(r.scores).toEqual([0, 5, 10]);
  });

  it('some elements violate Min → rejected', async () => {
    await expect(
      deserialize(NumberArrayDto, { scores: [5, -1, 10] }),
    ).rejects.toThrow(BakerValidationError);
  });
});

describe('each:true — error paths', () => {
  it('error path includes index', async () => {
    try {
      await deserialize(StringArrayDto, { tags: ['ok', 42] });
      expect.unreachable();
    } catch (e) {
      const errors = (e as BakerValidationError).errors;
      const tagErr = errors.find(err => err.path.startsWith('tags'));
      expect(tagErr).toBeDefined();
      expect(tagErr!.path).toContain('[');
    }
  });
});

describe('each:true — array + element combined', () => {
  it('ArrayMinSize + each MinLength passes', async () => {
    const r = await deserialize<MinLenArrayDto>(MinLenArrayDto, { names: ['ab', 'cd'] });
    expect(r.names).toEqual(['ab', 'cd']);
  });

  it('ArrayMinSize violation rejected', async () => {
    await expect(deserialize(MinLenArrayDto, { names: [] })).rejects.toThrow(BakerValidationError);
  });

  it('element MinLength violation rejected', async () => {
    await expect(deserialize(MinLenArrayDto, { names: ['a'] })).rejects.toThrow(BakerValidationError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E-1: Set/Map each rule test
// ─────────────────────────────────────────────────────────────────────────────

describe('each:true — Set with stopAtFirstError', () => {
  it('error path includes index (e.g. field[0])', async () => {
    configure({ stopAtFirstError: true });
    class SetDto {
      @Field(arrayOf(isString))
      items!: Set<string>;
    }
    try {
      await deserialize(SetDto, { items: new Set([42, 'ok']) });
      expect.unreachable();
    } catch (e) {
      const errors = (e as BakerValidationError).errors;
      const err = errors.find(err => err.path.startsWith('items'));
      expect(err).toBeDefined();
      expect(err!.path).toMatch(/items\[\d+\]/);
    }
  });
});

describe('each:true — Map with stopAtFirstError', () => {
  it('error path includes index', async () => {
    configure({ stopAtFirstError: true });
    class MapDto {
      @Field(arrayOf(isString))
      items!: Map<string, string>;
    }
    try {
      await deserialize(MapDto, { items: new Map([['a', 99 as any], ['b', 'ok']]) });
      expect.unreachable();
    } catch (e) {
      const errors = (e as BakerValidationError).errors;
      const err = errors.find(err => err.path.startsWith('items'));
      expect(err).toBeDefined();
      expect(err!.path).toMatch(/items\[\d+\]/);
    }
  });
});

describe('each:true — Set with collectErrors', () => {
  it('all errors collected', async () => {
    class SetCollectDto {
      @Field(arrayOf(isString))
      items!: Set<string>;
    }
    try {
      await deserialize(SetCollectDto, { items: new Set([42, 99]) });
      expect.unreachable();
    } catch (e) {
      const errors = (e as BakerValidationError).errors;
      const itemErrors = errors.filter(err => err.path.startsWith('items['));
      expect(itemErrors.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('each:true — Map with collectErrors', () => {
  it('all errors collected', async () => {
    class MapCollectDto {
      @Field(arrayOf(isString))
      items!: Map<string, string>;
    }
    try {
      await deserialize(MapCollectDto, { items: new Map([['a', 42 as any], ['b', 99 as any]]) });
      expect.unreachable();
    } catch (e) {
      const errors = (e as BakerValidationError).errors;
      const itemErrors = errors.filter(err => err.path.startsWith('items['));
      expect(itemErrors.length).toBeGreaterThanOrEqual(2);
    }
  });
});
