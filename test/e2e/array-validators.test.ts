import { describe, it, expect, afterEach } from 'bun:test';
import { Field, deserialize, isBakerError } from '../../index';
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
    const r = await deserialize(MinSizeDto, { items: [1, 2, 3] }) as MinSizeDto;
    expect(r.items).toHaveLength(3);
  });
  it('size below minimum rejected', async () => {
    expect(isBakerError(await deserialize(MinSizeDto, { items: [1] }))).toBe(true);
  });
});

describe('@ArrayMaxSize', () => {
  it('size at or below maximum passes', async () => {
    const r = await deserialize(MaxSizeDto, { items: [1, 2] }) as MaxSizeDto;
    expect(r.items).toHaveLength(2);
  });
  it('size above maximum rejected', async () => {
    expect(isBakerError(await deserialize(MaxSizeDto, { items: [1, 2, 3, 4] }))).toBe(true);
  });
});

describe('@ArrayUnique', () => {
  it('unique elements pass', async () => {
    const r = await deserialize(UniqueDto, { items: [1, 2, 3] }) as UniqueDto;
    expect(r.items).toEqual([1, 2, 3]);
  });
  it('duplicate elements rejected', async () => {
    expect(isBakerError(await deserialize(UniqueDto, { items: [1, 2, 2] }))).toBe(true);
  });
});

describe('@ArrayNotEmpty', () => {
  it('non-empty array passes', async () => {
    const r = await deserialize(NotEmptyDto, { items: [1] }) as NotEmptyDto;
    expect(r.items).toHaveLength(1);
  });
  it('empty array rejected', async () => {
    expect(isBakerError(await deserialize(NotEmptyDto, { items: [] }))).toBe(true);
  });
});

describe('@ArrayContains', () => {
  it('contains required elements passes', async () => {
    const r = await deserialize(ContainsDto, { items: ['a', 'b', 'c'] }) as ContainsDto;
    expect(r.items).toEqual(['a', 'b', 'c']);
  });
  it('missing required elements rejected', async () => {
    expect(isBakerError(await deserialize(ContainsDto, { items: ['a', 'c'] }))).toBe(true);
  });
  it('exactly the required elements passes', async () => {
    const r = await deserialize(ContainsDto, { items: ['a', 'b'] }) as ContainsDto;
    expect(r.items).toEqual(['a', 'b']);
  });
});
