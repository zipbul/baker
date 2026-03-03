import { describe, it, expect, afterEach } from 'bun:test';
import {
  seal, deserialize, BakerValidationError,
  IsArray, IsString, IsNumber, Min, MinLength, ArrayMinSize,
} from '../../index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class StringArrayDto {
  @IsArray()
  @IsString({ each: true })
  tags!: string[];
}

class NumberArrayDto {
  @IsArray()
  @IsNumber(undefined, { each: true })
  @Min(0, { each: true })
  scores!: number[];
}

class MinLenArrayDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @MinLength(2, { each: true })
  names!: string[];
}

// ─────────────────────────────────────────────────────────────────────────────

describe('each:true — 타입 검증', () => {
  it('모든 요소 문자열 → 통과', async () => {
    seal();
    const r = await deserialize<StringArrayDto>(StringArrayDto, { tags: ['a', 'b', 'c'] });
    expect(r.tags).toEqual(['a', 'b', 'c']);
  });

  it('비문자열 요소 → 거부', async () => {
    seal();
    await expect(
      deserialize(StringArrayDto, { tags: ['a', 123, 'c'] }),
    ).rejects.toThrow(BakerValidationError);
  });

  it('빈 배열 → 통과 (each는 요소별이라 검증 대상 없음)', async () => {
    seal();
    const r = await deserialize<StringArrayDto>(StringArrayDto, { tags: [] });
    expect(r.tags).toEqual([]);
  });
});

describe('each:true — 제약 검증', () => {
  it('모든 요소 Min 통과', async () => {
    seal();
    const r = await deserialize<NumberArrayDto>(NumberArrayDto, { scores: [0, 5, 10] });
    expect(r.scores).toEqual([0, 5, 10]);
  });

  it('일부 요소 Min 위반 → 거부', async () => {
    seal();
    await expect(
      deserialize(NumberArrayDto, { scores: [5, -1, 10] }),
    ).rejects.toThrow(BakerValidationError);
  });
});

describe('each:true — 에러 경로', () => {
  it('에러 path에 인덱스 포함', async () => {
    seal();
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

describe('each:true — 배열+요소 복합', () => {
  it('ArrayMinSize + each MinLength 통과', async () => {
    seal();
    const r = await deserialize<MinLenArrayDto>(MinLenArrayDto, { names: ['ab', 'cd'] });
    expect(r.names).toEqual(['ab', 'cd']);
  });

  it('ArrayMinSize 위반 거부', async () => {
    seal();
    await expect(deserialize(MinLenArrayDto, { names: [] })).rejects.toThrow(BakerValidationError);
  });

  it('요소 MinLength 위반 거부', async () => {
    seal();
    await expect(deserialize(MinLenArrayDto, { names: ['a'] })).rejects.toThrow(BakerValidationError);
  });
});
