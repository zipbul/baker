import { describe, it, expect, afterEach } from 'bun:test';
import {
  Field, deserialize, serialize, toJsonSchema, BakerValidationError,
} from '../../index';
import {
  isString, isNumber, isInt, isBoolean, isEnum, isArray,
  min, max, minLength, maxLength, matches,
  arrayMinSize,
} from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

/** 헬퍼: errors 배열 추출 */
async function getErrors(cls: new (...args: any[]) => any, input: unknown) {
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
    @Field(isString, minLength(3), maxLength(20), matches(/^[a-z0-9_]+$/))
    username!: string;
  }

  it('모든 조건 통과', async () => {
    const r = await deserialize<UsernameDto>(UsernameDto, { username: 'john_doe123' });
    expect(r.username).toBe('john_doe123');
  });

  it('타입 실패 → isString', async () => {
    const errors = await getErrors(UsernameDto, { username: 123 });
    expect(errors.some(e => e.code === 'isString')).toBe(true);
  });

  it('너무 짧음 → minLength', async () => {
    const errors = await getErrors(UsernameDto, { username: 'ab' });
    expect(errors.some(e => e.code === 'minLength')).toBe(true);
  });

  it('너무 김 → maxLength', async () => {
    const errors = await getErrors(UsernameDto, { username: 'a'.repeat(21) });
    expect(errors.some(e => e.code === 'maxLength')).toBe(true);
  });

  it('패턴 불일치 → matches', async () => {
    const errors = await getErrors(UsernameDto, { username: 'UPPER' });
    expect(errors.some(e => e.code === 'matches')).toBe(true);
  });

  it('길이 + 패턴 동시 실패 시 두 에러 수집', async () => {
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
    @Field(isNumber(), min(0), {
      optional: true,
      transform: ({ value }) => typeof value === 'string' ? parseInt(value, 10) : value,
    })
    score?: number;
  }

  it('undefined 시 통과 (Optional)', async () => {
    const r = await deserialize<ScoreDto>(ScoreDto, {});
    expect(r.score).toBeUndefined();
  });

  it('문자열 "42" → Transform → 숫자 42 + Min(0) 통과', async () => {
    const r = await deserialize<ScoreDto>(ScoreDto, { score: '42' });
    expect(r.score).toBe(42);
  });

  it('문자열 "-5" → Transform → -5 → Min(0) 거부', async () => {
    const errors = await getErrors(ScoreDto, { score: '-5' });
    expect(errors.some(e => e.code === 'min')).toBe(true);
  });
});

// ─── 3. @IsDefined + @IsNullable (null OK, undefined NOT OK) ──────────────

describe('@IsDefined + @IsNullable 조합', () => {
  class RequiredNullableDto {
    @Field(isString, { nullable: true })
    value!: string | null;
  }

  it('유효한 문자열 통과', async () => {
    const r = await deserialize<RequiredNullableDto>(RequiredNullableDto, { value: 'hello' });
    expect(r.value).toBe('hello');
  });

  it('null 통과 (@IsNullable)', async () => {
    const r = await deserialize<RequiredNullableDto>(RequiredNullableDto, { value: null });
    expect(r.value).toBeNull();
  });

  it('undefined (누락) 거부 (@IsDefined)', async () => {
    const errors = await getErrors(RequiredNullableDto, {});
    expect(errors.some(e => e.code === 'isDefined')).toBe(true);
  });
});

// ─── 4. @Transform + @IsEnum ───────────────────────────────────────────────

describe('@Transform + @IsEnum 조합', () => {
  enum Status { Active = 'active', Inactive = 'inactive' }

  class StatusDto {
    @Field(isEnum(Status), {
      transform: ({ value }) => typeof value === 'string' ? value.toLowerCase() : value,
    })
    status!: Status;
  }

  it('"ACTIVE" → lowercase Transform → "active" → enum 통과', async () => {
    const r = await deserialize<StatusDto>(StatusDto, { status: 'ACTIVE' });
    expect(r.status as string).toBe('active');
  });

  it('"unknown" → lowercase → enum 거부', async () => {
    const errors = await getErrors(StatusDto, { status: 'unknown' });
    expect(errors.some(e => e.code === 'isEnum')).toBe(true);
  });
});

// ─── 5. @ValidateIf + @IsNumber 조합 ──────────────────────────────────────

describe('@ValidateIf + @IsNumber 조합', () => {
  class ConditionalDto {
    @Field(isBoolean) hasDiscount!: boolean;

    @Field(isNumber(), min(0), max(100), {
      when: (obj: any) => obj.hasDiscount === true,
    })
    discountPercent!: number;
  }

  it('hasDiscount=true + 유효 discount 통과', async () => {
    const r = await deserialize<ConditionalDto>(ConditionalDto, { hasDiscount: true, discountPercent: 15 });
    expect(r.discountPercent).toBe(15);
  });

  it('hasDiscount=true + 무효 discount 거부', async () => {
    const errors = await getErrors(ConditionalDto, { hasDiscount: true, discountPercent: 150 });
    expect(errors.some(e => e.code === 'max')).toBe(true);
  });

  it('hasDiscount=false + 무효 discount 스킵', async () => {
    const r = await deserialize<ConditionalDto>(ConditionalDto, { hasDiscount: false, discountPercent: 'bad' });
    // discountPercent 검증 스킵
    expect(r.hasDiscount).toBe(false);
  });

  it('hasDiscount=false + discount 누락 스킵', async () => {
    const r = await deserialize<ConditionalDto>(ConditionalDto, { hasDiscount: false });
    expect(r.hasDiscount).toBe(false);
  });
});

// ─── 6. @Exclude(deserializeOnly) + @Transform(serializeOnly) ─────────────

describe('@Exclude(deserializeOnly) + @Transform(serializeOnly) 동일 필드', () => {
  class MixedDto {
    @Field(isString) name!: string;

    @Field(isString, {
      exclude: 'deserializeOnly',
      transform: ({ value, direction }) =>
        direction === 'serialize' ? `***${value}***` : value,
    })
    secret!: string;
  }

  it('deserialize 시 secret 제외', async () => {
    const r = await deserialize<MixedDto>(MixedDto, { name: 'test', secret: 'hidden' });
    expect(r.name).toBe('test');
    // Exclude deserializeOnly → deserialize 시 secret 무시
    expect(r.secret).toBeUndefined();
  });
});

// ─── 7. @IsArray + @Nested(each:true) + @ArrayMinSize + @IsOptional ───────

describe('@IsArray + @Nested(each:true) + @ArrayMinSize + @IsOptional', () => {
  class Tag {
    @Field(isString) label!: string;
  }

  class ArticleDto {
    @Field(isString) title!: string;

    @Field(isArray, arrayMinSize(1), {
      optional: true,
      type: () => [Tag],
    })
    tags?: Tag[];
  }

  it('tags 누락 → Optional 통과', async () => {
    const r = await deserialize<ArticleDto>(ArticleDto, { title: 'Hello' });
    expect(r.tags).toBeUndefined();
  });

  it('유효 tags 배열 통과', async () => {
    const r = await deserialize<ArticleDto>(ArticleDto, {
      title: 'Hello',
      tags: [{ label: 'news' }, { label: 'tech' }],
    });
    expect(r.tags).toHaveLength(2);
    expect(r.tags![0]!.label).toBe('news');
  });

  it('빈 tags 배열 → ArrayMinSize 거부', async () => {
    const errors = await getErrors(ArticleDto, { title: 'Hello', tags: [] });
    expect(errors.some(e => e.code === 'arrayMinSize')).toBe(true);
  });

  it('tags 배열 내 무효 항목 → isString 에러 경로 포함', async () => {
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
    @Field(isString, minLength(2), {
      name: 'raw_input',
      transform: ({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value,
    })
    processedInput!: string;
  }

  it('raw_input → trim+lowercase → MinLength 통과', async () => {
    const r = await deserialize<DeepStackDto>(DeepStackDto, { raw_input: '  HELLO  ' });
    expect(r.processedInput).toBe('hello');
  });

  it('serialize 시 Expose name 사용', async () => {
    const r = await deserialize<DeepStackDto>(DeepStackDto, { raw_input: 'TEST' });
    const plain = await serialize(r);
    expect(plain).toHaveProperty('raw_input');
  });

  it('trim 후 1자 → MinLength 거부', async () => {
    const errors = await getErrors(DeepStackDto, { raw_input: ' X ' });
    expect(errors.some(e => e.code === 'minLength')).toBe(true);
  });
});

// ─── 9. @ValidateIf + @Transform 상호작용 ─────────────────────────────────

describe('@ValidateIf + @Transform 상호작용', () => {
  class CondTransformDto {
    @Field(isBoolean) enabled!: boolean;

    @Field(isString, {
      when: (obj: any) => obj.enabled === true,
      transform: ({ value }) => typeof value === 'string' ? value.toUpperCase() : value,
    })
    data!: string;
  }

  it('enabled=true → Transform 실행 + 검증', async () => {
    const r = await deserialize<CondTransformDto>(CondTransformDto, { enabled: true, data: 'hello' });
    expect(r.data).toBe('HELLO');
  });

  it('enabled=false → 검증 스킵 (Transform도 적용되지만 검증은 안 함)', async () => {
    const r = await deserialize<CondTransformDto>(CondTransformDto, { enabled: false, data: 123 });
    // ValidateIf false → 검증 스킵이므로 통과
    expect(r.enabled).toBe(false);
  });
});

// ─── E-21: 4-level inheritance + mid-level override ─────────────────────────

describe('E-21: 4-level inheritance + mid-level override', () => {
  class Base {
    @Field(isString)
    name!: string;
  }

  class Child extends Base {
    @Field(isString, minLength(3))
    override name!: string;
  }

  class GrandChild extends Child {}

  class GrandGrandChild extends GrandChild {}

  it('GrandGrandChild enforces isString from Base', async () => {
    const errors = await getErrors(GrandGrandChild, { name: 123 });
    expect(errors.some(e => e.code === 'isString')).toBe(true);
  });

  it('GrandGrandChild enforces minLength(3) from Child', async () => {
    const errors = await getErrors(GrandGrandChild, { name: 'ab' });
    expect(errors.some(e => e.code === 'minLength')).toBe(true);
  });

  it('GrandGrandChild passes with valid value', async () => {
    const r = await deserialize<GrandGrandChild>(GrandGrandChild, { name: 'alice' });
    expect(r.name).toBe('alice');
  });

  it('GrandChild also enforces minLength(3) from Child', async () => {
    const errors = await getErrors(GrandChild, { name: 'ab' });
    expect(errors.some(e => e.code === 'minLength')).toBe(true);
  });

  it('serialize GrandGrandChild preserves value', async () => {
    const dto = Object.assign(new GrandGrandChild(), { name: 'alice' });
    const plain = await serialize(dto);
    expect(plain['name']).toBe('alice');
  });
});
