import { describe, it, expect, beforeEach } from 'bun:test';

import { Baker, Field, deserialize, isBakerIssueSet } from '../../index';
import {
  isArray,
  isString,
  arrayMinSize,
  arrayMaxSize,
  arrayUnique,
  arrayNotEmpty,
  arrayContains,
  arrayNotContains,
} from '../../src/rules/index';
import { assertBakerIssueSet } from '../integration/helpers/assert';

const baker = new Baker();

beforeEach(() => baker.seal());

// ─────────────────────────────────────────────────────────────────────────────

@baker.Recipe
class MinSizeDto {
  @Field(isArray, arrayMinSize(2)) items!: unknown[];
}
@baker.Recipe
class MaxSizeDto {
  @Field(isArray, arrayMaxSize(3)) items!: unknown[];
}
@baker.Recipe
class UniqueDto {
  @Field(isArray, arrayUnique()) items!: unknown[];
}
@baker.Recipe
class NotEmptyDto {
  @Field(arrayNotEmpty) items!: unknown[];
}
@baker.Recipe
class ContainsDto {
  @Field(arrayContains(['a', 'b'])) items!: string[];
}
@baker.Recipe
class NotContainsDto {
  @Field(arrayNotContains(['z'])) items!: string[];
}

// ─────────────────────────────────────────────────────────────────────────────

describe('@ArrayMinSize', () => {
  it('size at or above minimum passes', async () => {
    const r = (await deserialize(MinSizeDto, { items: [1, 2, 3] })) as MinSizeDto;
    expect(r.items).toHaveLength(3);
  });
  it('size below minimum rejected', async () => {
    expect(isBakerIssueSet(await deserialize(MinSizeDto, { items: [1] }))).toBe(true);
  });
  it('non-array value rejected even when it has length', async () => {
    expect(isBakerIssueSet(await deserialize(MinSizeDto, { items: 'abcd' }))).toBe(true);
  });
});

describe('@ArrayMaxSize', () => {
  it('size at or below maximum passes', async () => {
    const r = (await deserialize(MaxSizeDto, { items: [1, 2] })) as MaxSizeDto;
    expect(r.items).toHaveLength(2);
  });
  it('size above maximum rejected', async () => {
    expect(isBakerIssueSet(await deserialize(MaxSizeDto, { items: [1, 2, 3, 4] }))).toBe(true);
  });
  it('non-array value rejected even when it fits max length', async () => {
    expect(isBakerIssueSet(await deserialize(MaxSizeDto, { items: 'abc' }))).toBe(true);
  });
});

describe('@ArrayUnique', () => {
  it('unique elements pass', async () => {
    const r = (await deserialize(UniqueDto, { items: [1, 2, 3] })) as UniqueDto;
    expect(r.items).toEqual([1, 2, 3]);
  });
  it('duplicate elements rejected', async () => {
    expect(isBakerIssueSet(await deserialize(UniqueDto, { items: [1, 2, 2] }))).toBe(true);
  });
  it('non-array value rejected instead of being treated like an iterable', async () => {
    expect(isBakerIssueSet(await deserialize(UniqueDto, { items: 'aba' }))).toBe(true);
  });
});

describe('@ArrayNotEmpty', () => {
  it('non-empty array passes', async () => {
    const r = (await deserialize(NotEmptyDto, { items: [1] })) as NotEmptyDto;
    expect(r.items).toHaveLength(1);
  });
  it('empty array rejected', async () => {
    expect(isBakerIssueSet(await deserialize(NotEmptyDto, { items: [] }))).toBe(true);
  });
  it('non-array value rejected instead of using string length', async () => {
    expect(isBakerIssueSet(await deserialize(NotEmptyDto, { items: 'x' }))).toBe(true);
  });
});

describe('@ArrayContains', () => {
  it('contains required elements passes', async () => {
    const r = (await deserialize(ContainsDto, { items: ['a', 'b', 'c'] })) as ContainsDto;
    expect(r.items).toEqual(['a', 'b', 'c']);
  });
  it('missing required elements rejected', async () => {
    expect(isBakerIssueSet(await deserialize(ContainsDto, { items: ['a', 'c'] }))).toBe(true);
  });
  it('exactly the required elements passes', async () => {
    const r = (await deserialize(ContainsDto, { items: ['a', 'b'] })) as ContainsDto;
    expect(r.items).toEqual(['a', 'b']);
  });
  it('non-array value rejected even when string search would match', async () => {
    expect(isBakerIssueSet(await deserialize(ContainsDto, { items: 'catab' }))).toBe(true);
  });
});

describe('@ArrayNotContains', () => {
  it('array without forbidden values passes', async () => {
    const r = (await deserialize(NotContainsDto, { items: ['a', 'b'] })) as NotContainsDto;
    expect(r.items).toEqual(['a', 'b']);
  });
  it('non-array value rejected even when string search would not match', async () => {
    expect(isBakerIssueSet(await deserialize(NotContainsDto, { items: 'abc' }))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Array-level rules on Set collection (Set + arrayMinSize)
// ─────────────────────────────────────────────────────────────────────────────

describe('Set collection + array-level rules', () => {
  @baker.Recipe
  class SetItem {
    @Field(isString) name!: string;
  }

  @baker.Recipe
  class SetWithMinDto {
    @Field(arrayMinSize(2), { type: () => Set, setValue: () => SetItem })
    items!: Set<SetItem>;
  }

  it('Set with arrayMinSize — valid', async () => {
    const result = (await deserialize(SetWithMinDto, { items: [{ name: 'a' }, { name: 'b' }] })) as SetWithMinDto;
    expect(result.items).toBeInstanceOf(Set);
    expect(result.items.size).toBe(2);
  });

  it('Set with arrayMinSize — too few items → error', async () => {
    const result = await deserialize(SetWithMinDto, { items: [{ name: 'a' }] });
    assertBakerIssueSet(result);
    expect(result.errors.some(e => e.code === 'arrayMinSize')).toBe(true);
  });
});
