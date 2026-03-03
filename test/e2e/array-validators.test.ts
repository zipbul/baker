import { describe, it, expect, afterEach } from 'bun:test';
import {
  seal, deserialize, BakerValidationError,
  IsArray, ArrayMinSize, ArrayMaxSize, ArrayUnique, ArrayNotEmpty, ArrayContains,
} from '../../index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class MinSizeDto {
  @IsArray() @ArrayMinSize(2) items!: unknown[];
}
class MaxSizeDto {
  @IsArray() @ArrayMaxSize(3) items!: unknown[];
}
class UniqueDto {
  @IsArray() @ArrayUnique() items!: unknown[];
}
class NotEmptyDto {
  @ArrayNotEmpty() items!: unknown[];
}
class ContainsDto {
  @ArrayContains(['a', 'b']) items!: string[];
}

// ─────────────────────────────────────────────────────────────────────────────

describe('@ArrayMinSize', () => {
  it('크기 이상 통과', async () => {
    seal();
    const r = await deserialize<MinSizeDto>(MinSizeDto, { items: [1, 2, 3] });
    expect(r.items).toHaveLength(3);
  });
  it('크기 미달 거부', async () => {
    seal();
    await expect(deserialize(MinSizeDto, { items: [1] })).rejects.toThrow(BakerValidationError);
  });
});

describe('@ArrayMaxSize', () => {
  it('크기 이하 통과', async () => {
    seal();
    const r = await deserialize<MaxSizeDto>(MaxSizeDto, { items: [1, 2] });
    expect(r.items).toHaveLength(2);
  });
  it('크기 초과 거부', async () => {
    seal();
    await expect(deserialize(MaxSizeDto, { items: [1, 2, 3, 4] })).rejects.toThrow(BakerValidationError);
  });
});

describe('@ArrayUnique', () => {
  it('고유 요소 통과', async () => {
    seal();
    const r = await deserialize<UniqueDto>(UniqueDto, { items: [1, 2, 3] });
    expect(r.items).toEqual([1, 2, 3]);
  });
  it('중복 요소 거부', async () => {
    seal();
    await expect(deserialize(UniqueDto, { items: [1, 2, 2] })).rejects.toThrow(BakerValidationError);
  });
});

describe('@ArrayNotEmpty', () => {
  it('비어있지 않은 배열 통과', async () => {
    seal();
    const r = await deserialize<NotEmptyDto>(NotEmptyDto, { items: [1] });
    expect(r.items).toHaveLength(1);
  });
  it('빈 배열 거부', async () => {
    seal();
    await expect(deserialize(NotEmptyDto, { items: [] })).rejects.toThrow(BakerValidationError);
  });
});

describe('@ArrayContains', () => {
  it('필요 요소 포함 통과', async () => {
    seal();
    const r = await deserialize<ContainsDto>(ContainsDto, { items: ['a', 'b', 'c'] });
    expect(r.items).toEqual(['a', 'b', 'c']);
  });
  it('필요 요소 미포함 거부', async () => {
    seal();
    await expect(deserialize(ContainsDto, { items: ['a', 'c'] })).rejects.toThrow(BakerValidationError);
  });
  it('정확히 필수 요소만 통과', async () => {
    seal();
    const r = await deserialize<ContainsDto>(ContainsDto, { items: ['a', 'b'] });
    expect(r.items).toEqual(['a', 'b']);
  });
});
