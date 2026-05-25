import { describe, it, expect, afterEach, beforeEach } from 'bun:test';

import { Field, Recipe, arrayOf, deserialize, configure, isBakerIssueSet, seal } from '../../index';
import { isArray, isString, isNumber, min, minLength, arrayMinSize } from '../../src/rules/index';
import { assertBakerIssueSet } from '../integration/helpers/assert';
import { sealClass } from '../integration/helpers/seal';
import { unseal } from '../integration/helpers/unseal';

beforeEach(() => unseal());
afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

@Recipe
class StringArrayDto {
  @Field(isArray, arrayOf(isString))
  tags!: string[];
}

@Recipe
class NumberArrayDto {
  @Field(isArray, arrayOf(isNumber(), min(0)))
  scores!: number[];
}

@Recipe
class MinLenArrayDto {
  @Field(isArray, arrayMinSize(1), arrayOf(isString, minLength(2)))
  names!: string[];
}

// ─────────────────────────────────────────────────────────────────────────────

describe('each:true — type validation', () => {
  it('all elements string → passes', async () => {
    seal();
    const r = (await deserialize<StringArrayDto>(StringArrayDto, { tags: ['a', 'b', 'c'] })) as StringArrayDto;
    expect(r.tags).toEqual(['a', 'b', 'c']);
  });

  it('non-string element → rejected', async () => {
    seal();
    expect(isBakerIssueSet(await deserialize(StringArrayDto, { tags: ['a', 123, 'c'] }))).toBe(true);
  });

  it('empty array → passes (each is per-element, no elements to validate)', async () => {
    seal();
    const r = (await deserialize<StringArrayDto>(StringArrayDto, { tags: [] })) as StringArrayDto;
    expect(r.tags).toEqual([]);
  });
});

describe('each:true — constraint validation', () => {
  it('all elements pass Min', async () => {
    seal();
    const r = (await deserialize<NumberArrayDto>(NumberArrayDto, { scores: [0, 5, 10] })) as NumberArrayDto;
    expect(r.scores).toEqual([0, 5, 10]);
  });

  it('some elements violate Min → rejected', async () => {
    seal();
    expect(isBakerIssueSet(await deserialize(NumberArrayDto, { scores: [5, -1, 10] }))).toBe(true);
  });
});

describe('each:true — error paths', () => {
  it('error path includes index', async () => {
    seal();
    const result = await deserialize(StringArrayDto, { tags: ['ok', 42] });
    assertBakerIssueSet(result);
    const tagErr = result.errors.find(err => err.path.startsWith('tags'));
    expect(tagErr).toBeDefined();
    expect(tagErr!.path).toContain('[');
  });
});

describe('each:true — array + element combined', () => {
  it('ArrayMinSize + each MinLength passes', async () => {
    seal();
    const r = (await deserialize<MinLenArrayDto>(MinLenArrayDto, { names: ['ab', 'cd'] })) as MinLenArrayDto;
    expect(r.names).toEqual(['ab', 'cd']);
  });

  it('ArrayMinSize violation rejected', async () => {
    seal();
    expect(isBakerIssueSet(await deserialize(MinLenArrayDto, { names: [] }))).toBe(true);
  });

  it('element MinLength violation rejected', async () => {
    seal();
    expect(isBakerIssueSet(await deserialize(MinLenArrayDto, { names: ['a'] }))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E-1: Set/Map each rule test
// ─────────────────────────────────────────────────────────────────────────────

describe('each:true — Set with stopAtFirstError', () => {
  it('error path includes index (e.g. field[0])', async () => {
    configure({ stopAtFirstError: true });
    seal();
    @Recipe
    class SetDto {
      @Field(arrayOf(isString))
      items!: Set<string>;
    }
    sealClass(SetDto);
    const result = await deserialize(SetDto, { items: new Set([42, 'ok']) });
    assertBakerIssueSet(result);
    const err = result.errors.find(err => err.path.startsWith('items'));
    expect(err).toBeDefined();
    expect(err!.path).toMatch(/items\[\d+\]/);
  });
});

describe('each:true — Map with stopAtFirstError', () => {
  it('error path includes index', async () => {
    configure({ stopAtFirstError: true });
    seal();
    @Recipe
    class MapDto {
      @Field(arrayOf(isString))
      items!: Map<string, string>;
    }
    sealClass(MapDto);
    const result = await deserialize(MapDto, {
      items: new Map<string, unknown>([
        ['a', 99],
        ['b', 'ok'],
      ]),
    });
    assertBakerIssueSet(result);
    const err = result.errors.find(err => err.path.startsWith('items'));
    expect(err).toBeDefined();
    expect(err!.path).toMatch(/items\[\d+\]/);
  });
});

describe('each:true — Set with collectErrors', () => {
  it('all errors collected', async () => {
    seal();
    @Recipe
    class SetCollectDto {
      @Field(arrayOf(isString))
      items!: Set<string>;
    }
    sealClass(SetCollectDto);
    const result = await deserialize(SetCollectDto, { items: new Set([42, 99]) });
    assertBakerIssueSet(result);
    const itemErrors = result.errors.filter(err => err.path.startsWith('items['));
    expect(itemErrors.length).toBeGreaterThanOrEqual(2);
  });
});

describe('each:true — Map with collectErrors', () => {
  it('all errors collected', async () => {
    seal();
    @Recipe
    class MapCollectDto {
      @Field(arrayOf(isString))
      items!: Map<string, string>;
    }
    sealClass(MapCollectDto);
    const result = await deserialize(MapCollectDto, {
      items: new Map<string, unknown>([
        ['a', 42],
        ['b', 99],
      ]),
    });
    assertBakerIssueSet(result);
    const itemErrors = result.errors.filter(err => err.path.startsWith('items['));
    expect(itemErrors.length).toBeGreaterThanOrEqual(2);
  });
});
