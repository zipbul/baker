import { describe, it, expect, afterEach } from 'bun:test';
import {
  seal, deserialize, serialize, toJsonSchema, BakerValidationError,
  IsString, IsNumber, IsInt, IsBoolean, IsOptional, IsNullable, IsDefined,
  Min, Max, MinLength, MaxLength, Matches,
  Transform, Expose, Exclude, ValidateIf, IsEnum,
  Nested, ArrayMinSize, IsArray,
} from '../../index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

/** 헬퍼: errors 배열 추출 */
async function getErrors(cls: Function, input: unknown) {
  try {
    await deserialize(cls, input);
    throw new Error('expected rejection');
  } catch (e) {
    if (!(e instanceof BakerValidationError)) throw e;
    return e.errors;
  }
}

// ─── 1. @IsString + @MinLength + @MaxLength + @Matches ─────────────────────

describe('@IsString + @MinLength + @MaxLength + @Matches 스택', () => {
  class UsernameDto {
    @IsString()
    @MinLength(3)
    @MaxLength(20)
    @Matches(/^[a-z0-9_]+$/)
    username!: string;
  }

  it('모든 조건 통과', async () => {
    seal();
    const r = await deserialize<UsernameDto>(UsernameDto, { username: 'john_doe123' });
    expect(r.username).toBe('john_doe123');
  });

  it('타입 실패 → isString', async () => {
    seal();
    const errors = await getErrors(UsernameDto, { username: 123 });
    expect(errors.some(e => e.code === 'isString')).toBe(true);
  });

  it('너무 짧음 → minLength', async () => {
    seal();
    const errors = await getErrors(UsernameDto, { username: 'ab' });
    expect(errors.some(e => e.code === 'minLength')).toBe(true);
  });

  it('너무 김 → maxLength', async () => {
    seal();
    const errors = await getErrors(UsernameDto, { username: 'a'.repeat(21) });
    expect(errors.some(e => e.code === 'maxLength')).toBe(true);
  });

  it('패턴 불일치 → matches', async () => {
    seal();
    const errors = await getErrors(UsernameDto, { username: 'UPPER' });
    expect(errors.some(e => e.code === 'matches')).toBe(true);
  });

  it('길이 + 패턴 동시 실패 시 두 에러 수집', async () => {
    seal();
    const errors = await getErrors(UsernameDto, { username: 'A!' });
    // minLength(3) 실패 + matches 실패
    expect(errors.length).toBeGreaterThanOrEqual(2);
    const codes = errors.map(e => e.code);
    expect(codes).toContain('minLength');
    expect(codes).toContain('matches');
  });
});

// ─── 2. @IsOptional + @Min + @Transform ────────────────────────────────────

describe('@IsOptional + @Min + @Transform 조합', () => {
  class ScoreDto {
    @IsOptional()
    @Transform(({ value }) => typeof value === 'string' ? parseInt(value, 10) : value)
    @IsNumber()
    @Min(0)
    score?: number;
  }

  it('undefined 시 통과 (Optional)', async () => {
    seal();
    const r = await deserialize<ScoreDto>(ScoreDto, {});
    expect(r.score).toBeUndefined();
  });

  it('문자열 "42" → Transform → 숫자 42 + Min(0) 통과', async () => {
    seal();
    const r = await deserialize<ScoreDto>(ScoreDto, { score: '42' });
    expect(r.score).toBe(42);
  });

  it('문자열 "-5" → Transform → -5 → Min(0) 거부', async () => {
    seal();
    const errors = await getErrors(ScoreDto, { score: '-5' });
    expect(errors.some(e => e.code === 'min')).toBe(true);
  });
});

// ─── 3. @IsDefined + @IsNullable (null OK, undefined NOT OK) ──────────────

describe('@IsDefined + @IsNullable 조합', () => {
  class RequiredNullableDto {
    @IsDefined()
    @IsNullable()
    @IsString()
    value!: string | null;
  }

  it('유효한 문자열 통과', async () => {
    seal();
    const r = await deserialize<RequiredNullableDto>(RequiredNullableDto, { value: 'hello' });
    expect(r.value).toBe('hello');
  });

  it('null 통과 (@IsNullable)', async () => {
    seal();
    const r = await deserialize<RequiredNullableDto>(RequiredNullableDto, { value: null });
    expect(r.value).toBeNull();
  });

  it('undefined (누락) 거부 (@IsDefined)', async () => {
    seal();
    const errors = await getErrors(RequiredNullableDto, {});
    expect(errors.some(e => e.code === 'isDefined')).toBe(true);
  });
});

// ─── 4. @Transform + @IsEnum ───────────────────────────────────────────────

describe('@Transform + @IsEnum 조합', () => {
  enum Status { Active = 'active', Inactive = 'inactive' }

  class StatusDto {
    @Transform(({ value }) => typeof value === 'string' ? value.toLowerCase() : value)
    @IsEnum(Status)
    status!: Status;
  }

  it('"ACTIVE" → lowercase Transform → "active" → enum 통과', async () => {
    seal();
    const r = await deserialize<StatusDto>(StatusDto, { status: 'ACTIVE' });
    expect(r.status).toBe('active');
  });

  it('"unknown" → lowercase → enum 거부', async () => {
    seal();
    const errors = await getErrors(StatusDto, { status: 'unknown' });
    expect(errors.some(e => e.code === 'isEnum')).toBe(true);
  });
});

// ─── 5. @ValidateIf + @IsNumber 조합 ──────────────────────────────────────

describe('@ValidateIf + @IsNumber 조합', () => {
  class ConditionalDto {
    @IsBoolean() hasDiscount!: boolean;

    @ValidateIf((obj: any) => obj.hasDiscount === true)
    @IsNumber()
    @Min(0)
    @Max(100)
    discountPercent!: number;
  }

  it('hasDiscount=true + 유효 discount 통과', async () => {
    seal();
    const r = await deserialize<ConditionalDto>(ConditionalDto, { hasDiscount: true, discountPercent: 15 });
    expect(r.discountPercent).toBe(15);
  });

  it('hasDiscount=true + 무효 discount 거부', async () => {
    seal();
    const errors = await getErrors(ConditionalDto, { hasDiscount: true, discountPercent: 150 });
    expect(errors.some(e => e.code === 'max')).toBe(true);
  });

  it('hasDiscount=false + 무효 discount 스킵', async () => {
    seal();
    const r = await deserialize<ConditionalDto>(ConditionalDto, { hasDiscount: false, discountPercent: 'bad' });
    // discountPercent 검증 스킵
    expect(r.hasDiscount).toBe(false);
  });

  it('hasDiscount=false + discount 누락 스킵', async () => {
    seal();
    const r = await deserialize<ConditionalDto>(ConditionalDto, { hasDiscount: false });
    expect(r.hasDiscount).toBe(false);
  });
});

// ─── 6. @Exclude(deserializeOnly) + @Transform(serializeOnly) ─────────────

describe('@Exclude(deserializeOnly) + @Transform(serializeOnly) 동일 필드', () => {
  class MixedDto {
    @IsString() name!: string;

    @Exclude({ deserializeOnly: true })
    @Transform(({ value }) => `***${value}***`, { serializeOnly: true })
    @IsString()
    secret!: string;
  }

  it('deserialize 시 secret 제외', async () => {
    seal();
    const r = await deserialize<MixedDto>(MixedDto, { name: 'test', secret: 'hidden' });
    expect(r.name).toBe('test');
    // Exclude deserializeOnly → deserialize 시 secret 무시
    expect(r.secret).toBeUndefined();
  });
});

// ─── 7. @IsArray + @Nested(each:true) + @ArrayMinSize + @IsOptional ───────

describe('@IsArray + @Nested(each:true) + @ArrayMinSize + @IsOptional', () => {
  class Tag {
    @IsString() label!: string;
  }

  class ArticleDto {
    @IsString() title!: string;

    @IsOptional()
    @IsArray()
    @Nested(() => Tag, { each: true })
    @ArrayMinSize(1)
    tags?: Tag[];
  }

  it('tags 누락 → Optional 통과', async () => {
    seal();
    const r = await deserialize<ArticleDto>(ArticleDto, { title: 'Hello' });
    expect(r.tags).toBeUndefined();
  });

  it('유효 tags 배열 통과', async () => {
    seal();
    const r = await deserialize<ArticleDto>(ArticleDto, {
      title: 'Hello',
      tags: [{ label: 'news' }, { label: 'tech' }],
    });
    expect(r.tags).toHaveLength(2);
    expect(r.tags![0].label).toBe('news');
  });

  it('빈 tags 배열 → ArrayMinSize 거부', async () => {
    seal();
    const errors = await getErrors(ArticleDto, { title: 'Hello', tags: [] });
    expect(errors.some(e => e.code === 'arrayMinSize')).toBe(true);
  });

  it('tags 배열 내 무효 항목 → isString 에러 경로 포함', async () => {
    seal();
    const errors = await getErrors(ArticleDto, {
      title: 'Hello',
      tags: [{ label: 'ok' }, { label: 123 }],
    });
    expect(errors.some(e => e.path === 'tags[1].label' && e.code === 'isString')).toBe(true);
  });
});

// ─── 8. 깊은 스택: @Expose + @Transform + @IsString + @MinLength ──────────

describe('@Expose + @Transform + @IsString + @MinLength 깊은 스택', () => {
  class DeepStackDto {
    @Expose({ name: 'raw_input' })
    @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
    @IsString()
    @MinLength(2)
    processedInput!: string;
  }

  it('raw_input → trim+lowercase → MinLength 통과', async () => {
    seal();
    const r = await deserialize<DeepStackDto>(DeepStackDto, { raw_input: '  HELLO  ' });
    expect(r.processedInput).toBe('hello');
  });

  it('serialize 시 Expose name 사용', async () => {
    seal();
    const r = await deserialize<DeepStackDto>(DeepStackDto, { raw_input: 'TEST' });
    const plain = await serialize(r);
    expect(plain).toHaveProperty('raw_input');
  });

  it('trim 후 1자 → MinLength 거부', async () => {
    seal();
    const errors = await getErrors(DeepStackDto, { raw_input: ' X ' });
    expect(errors.some(e => e.code === 'minLength')).toBe(true);
  });
});

// ─── 9. @ValidateIf + @Transform 상호작용 ─────────────────────────────────

describe('@ValidateIf + @Transform 상호작용', () => {
  class CondTransformDto {
    @IsBoolean() enabled!: boolean;

    @ValidateIf((obj: any) => obj.enabled === true)
    @Transform(({ value }) => typeof value === 'string' ? value.toUpperCase() : value)
    @IsString()
    data!: string;
  }

  it('enabled=true → Transform 실행 + 검증', async () => {
    seal();
    const r = await deserialize<CondTransformDto>(CondTransformDto, { enabled: true, data: 'hello' });
    expect(r.data).toBe('HELLO');
  });

  it('enabled=false → 검증 스킵 (Transform도 적용되지만 검증은 안 함)', async () => {
    seal();
    const r = await deserialize<CondTransformDto>(CondTransformDto, { enabled: false, data: 123 });
    // ValidateIf false → 검증 스킵이므로 통과
    expect(r.enabled).toBe(false);
  });
});
