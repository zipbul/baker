import { describe, it, expect, afterEach } from 'bun:test';
import { Field, deserialize, BakerValidationError } from '../../index';
import { isArray, arrayMinSize, arrayMaxSize, arrayUnique, arrayNotEmpty, arrayContains } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class MinSizeDto {
  @Field(isArray, arrayMinSize(2)) items!: unknown[];
}
class MaxSizeDto {
  @Field(isArray, arrayMaxSize(3)) items!: unknown[];
}
class UniqueDto {
  @Field(isArray, arrayUnique()) items!: unknown[];
}
class NotEmptyDto {
  @Field(arrayNotEmpty) items!: unknown[];
}
class ContainsDto {
  @Field(arrayContains(['a', 'b'])) items!: string[];
}

// ─────────────────────────────────────────────────────────────────────────────

describe('@ArrayMinSize', () => {
  it('size at or above minimum passes', async () => {
    const r = await deserialize<MinSizeDto>(MinSizeDto, { items: [1, 2, 3] });
    expect(r.items).toHaveLength(3);
  });
  it('size below minimum rejected', async () => {
    await expect(deserialize(MinSizeDto, { items: [1] })).rejects.toThrow(BakerValidationError);
  });
});

describe('@ArrayMaxSize', () => {
  it('size at or below maximum passes', async () => {
    const r = await deserialize<MaxSizeDto>(MaxSizeDto, { items: [1, 2] });
    expect(r.items).toHaveLength(2);
  });
  it('size above maximum rejected', async () => {
    await expect(deserialize(MaxSizeDto, { items: [1, 2, 3, 4] })).rejects.toThrow(BakerValidationError);
  });
});

describe('@ArrayUnique', () => {
  it('unique elements pass', async () => {
    const r = await deserialize<UniqueDto>(UniqueDto, { items: [1, 2, 3] });
    expect(r.items).toEqual([1, 2, 3]);
  });
  it('duplicate elements rejected', async () => {
    await expect(deserialize(UniqueDto, { items: [1, 2, 2] })).rejects.toThrow(BakerValidationError);
  });
});

describe('@ArrayNotEmpty', () => {
  it('non-empty array passes', async () => {
    const r = await deserialize<NotEmptyDto>(NotEmptyDto, { items: [1] });
    expect(r.items).toHaveLength(1);
  });
  it('empty array rejected', async () => {
    await expect(deserialize(NotEmptyDto, { items: [] })).rejects.toThrow(BakerValidationError);
  });
});

describe('@ArrayContains', () => {
  it('contains required elements passes', async () => {
    const r = await deserialize<ContainsDto>(ContainsDto, { items: ['a', 'b', 'c'] });
    expect(r.items).toEqual(['a', 'b', 'c']);
  });
  it('missing required elements rejected', async () => {
    await expect(deserialize(ContainsDto, { items: ['a', 'c'] })).rejects.toThrow(BakerValidationError);
  });
  it('exactly the required elements passes', async () => {
    const r = await deserialize<ContainsDto>(ContainsDto, { items: ['a', 'b'] });
    expect(r.items).toEqual(['a', 'b']);
  });
});
