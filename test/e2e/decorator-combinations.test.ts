import { describe, it, expect, afterEach } from 'bun:test';
import {
  Field, deserialize, serialize, isBakerError,
} from '../../index';
import type { BakerErrors } from '../../index';
import {
  isString, isNumber, isInt, isBoolean, isEnum, isArray,
  min, max, minLength, maxLength, matches,
  arrayMinSize,
} from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

async function getErrors(cls: new (...args: any[]) => any, input: unknown) {
  const result = await deserialize(cls, input);
  if (!isBakerError(result)) throw new Error('expected error');
  return result.errors;
}

// ─── 1. @IsString + @MinLength + @MaxLength + @Matches ─────────────────────

describe('@IsString + @MinLength + @MaxLength + @Matches stack', () => {
  class UsernameDto {
    @Field(isString, minLength(3), maxLength(20), matches(/^[a-z0-9_]+$/))
    username!: string;
  }

  it('all conditions pass', async () => {
    const r = await deserialize(UsernameDto, { username: 'john_doe123' }) as UsernameDto;
    expect(r.username).toBe('john_doe123');
  });

  it('type failure → isString', async () => {
    const errors = await getErrors(UsernameDto, { username: 123 });
    expect(errors.some(e => e.code === 'isString')).toBe(true);
  });

  it('too short → minLength', async () => {
    const errors = await getErrors(UsernameDto, { username: 'ab' });
    expect(errors.some(e => e.code === 'minLength')).toBe(true);
  });

  it('too long → maxLength', async () => {
    const errors = await getErrors(UsernameDto, { username: 'a'.repeat(21) });
    expect(errors.some(e => e.code === 'maxLength')).toBe(true);
  });

  it('pattern mismatch → matches', async () => {
    const errors = await getErrors(UsernameDto, { username: 'UPPER' });
    expect(errors.some(e => e.code === 'matches')).toBe(true);
  });

  it('length + pattern simultaneous failure collects both errors', async () => {
    const errors = await getErrors(UsernameDto, { username: 'A!' });
    // minLength(3) failure + matches failure
    expect(errors.length).toBeGreaterThanOrEqual(2);
    const codes = errors.map(e => e.code);
    expect(codes).toContain('minLength');
    expect(codes).toContain('matches');
  });
});

// ─── 2. @IsOptional + @Min + @Transform ────────────────────────────────────

describe('@IsOptional + @Min + @Transform combination', () => {
  class ScoreDto {
    @Field(isNumber(), min(0), {
      optional: true,
      transform: ({ value }) => typeof value === 'string' ? parseInt(value, 10) : value,
    })
    score?: number;
  }

  it('undefined → passes (Optional)', async () => {
    const r = await deserialize(ScoreDto, {}) as ScoreDto;
    expect(r.score).toBeUndefined();
  });

  it('string "42" → Transform → number 42 + Min(0) passes', async () => {
    const r = await deserialize(ScoreDto, { score: '42' }) as ScoreDto;
    expect(r.score).toBe(42);
  });

  it('string "-5" → Transform → -5 → Min(0) rejected', async () => {
    const errors = await getErrors(ScoreDto, { score: '-5' });
    expect(errors.some(e => e.code === 'min')).toBe(true);
  });
});

// ─── 3. @IsDefined + @IsNullable (null OK, undefined NOT OK) ──────────────

describe('@IsDefined + @IsNullable combination', () => {
  class RequiredNullableDto {
    @Field(isString, { nullable: true })
    value!: string | null;
  }

  it('valid string passes', async () => {
    const r = await deserialize(RequiredNullableDto, { value: 'hello' }) as RequiredNullableDto;
    expect(r.value).toBe('hello');
  });

  it('null passes (@IsNullable)', async () => {
    const r = await deserialize(RequiredNullableDto, { value: null }) as RequiredNullableDto;
    expect(r.value).toBeNull();
  });

  it('undefined (missing) rejected (@IsDefined)', async () => {
    const errors = await getErrors(RequiredNullableDto, {});
    expect(errors.some(e => e.code === 'isDefined')).toBe(true);
  });
});

// ─── 4. @Transform + @IsEnum ───────────────────────────────────────────────

describe('@Transform + @IsEnum combination', () => {
  enum Status { Active = 'active', Inactive = 'inactive' }

  class StatusDto {
    @Field(isEnum(Status), {
      transform: ({ value }) => typeof value === 'string' ? value.toLowerCase() : value,
    })
    status!: Status;
  }

  it('"ACTIVE" → lowercase Transform → "active" → enum passes', async () => {
    const r = await deserialize(StatusDto, { status: 'ACTIVE' }) as StatusDto;
    expect(r.status as string).toBe('active');
  });

  it('"unknown" → lowercase → enum rejected', async () => {
    const errors = await getErrors(StatusDto, { status: 'unknown' });
    expect(errors.some(e => e.code === 'isEnum')).toBe(true);
  });
});

// ─── 5. @ValidateIf + @IsNumber combination ──────────────────────────────

describe('@ValidateIf + @IsNumber combination', () => {
  class ConditionalDto {
    @Field(isBoolean) hasDiscount!: boolean;

    @Field(isNumber(), min(0), max(100), {
      when: (obj: any) => obj.hasDiscount === true,
    })
    discountPercent!: number;
  }

  it('hasDiscount=true + valid discount passes', async () => {
    const r = await deserialize(ConditionalDto, { hasDiscount: true, discountPercent: 15 }) as ConditionalDto;
    expect(r.discountPercent).toBe(15);
  });

  it('hasDiscount=true + invalid discount rejected', async () => {
    const errors = await getErrors(ConditionalDto, { hasDiscount: true, discountPercent: 150 });
    expect(errors.some(e => e.code === 'max')).toBe(true);
  });

  it('hasDiscount=false + invalid discount skipped', async () => {
    const r = await deserialize(ConditionalDto, { hasDiscount: false, discountPercent: 'bad' }) as ConditionalDto;
    // discountPercent validation skipped
    expect(r.hasDiscount).toBe(false);
  });

  it('hasDiscount=false + discount missing skipped', async () => {
    const r = await deserialize(ConditionalDto, { hasDiscount: false }) as ConditionalDto;
    expect(r.hasDiscount).toBe(false);
  });
});

// ─── 6. @Exclude(deserializeOnly) + @Transform(serializeOnly) ─────────────

describe('@Exclude(deserializeOnly) + @Transform(serializeOnly) same field', () => {
  class MixedDto {
    @Field(isString) name!: string;

    @Field(isString, {
      exclude: 'deserializeOnly',
      transform: ({ value, direction }) =>
        direction === 'serialize' ? `***${value}***` : value,
    })
    secret!: string;
  }

  it('deserialize excludes secret', async () => {
    const r = await deserialize(MixedDto, { name: 'test', secret: 'hidden' }) as MixedDto;
    expect(r.name).toBe('test');
    // Exclude deserializeOnly → secret ignored during deserialize
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

  it('tags missing → Optional passes', async () => {
    const r = await deserialize(ArticleDto, { title: 'Hello' }) as ArticleDto;
    expect(r.tags).toBeUndefined();
  });

  it('valid tags array passes', async () => {
    const r = await deserialize(ArticleDto, {
      title: 'Hello',
      tags: [{ label: 'news' }, { label: 'tech' }],
    }) as ArticleDto;
    expect(r.tags).toHaveLength(2);
    expect(r.tags![0]!.label).toBe('news');
  });

  it('empty tags array → ArrayMinSize rejected', async () => {
    const errors = await getErrors(ArticleDto, { title: 'Hello', tags: [] });
    expect(errors.some(e => e.code === 'arrayMinSize')).toBe(true);
  });

  it('invalid item in tags array → isString error path included', async () => {
    const errors = await getErrors(ArticleDto, {
      title: 'Hello',
      tags: [{ label: 'ok' }, { label: 123 }],
    });
    expect(errors.some(e => e.path === 'tags[1].label' && e.code === 'isString')).toBe(true);
  });
});

// ─── 8. deep stack: @Expose + @Transform + @IsString + @MinLength ──────────

describe('@Expose + @Transform + @IsString + @MinLength deep stack', () => {
  class DeepStackDto {
    @Field(isString, minLength(2), {
      name: 'raw_input',
      transform: ({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value,
    })
    processedInput!: string;
  }

  it('raw_input → trim+lowercase → MinLength passes', async () => {
    const r = await deserialize(DeepStackDto, { raw_input: '  HELLO  ' }) as DeepStackDto;
    expect(r.processedInput).toBe('hello');
  });

  it('serialize uses Expose name', async () => {
    const r = await deserialize(DeepStackDto, { raw_input: 'TEST' }) as DeepStackDto;
    const plain = await serialize(r);
    expect(plain).toHaveProperty('raw_input');
  });

  it('trimmed to 1 char → MinLength rejected', async () => {
    const errors = await getErrors(DeepStackDto, { raw_input: ' X ' });
    expect(errors.some(e => e.code === 'minLength')).toBe(true);
  });
});

// ─── 9. @ValidateIf + @Transform interaction ─────────────────────────────

describe('@ValidateIf + @Transform interaction', () => {
  class CondTransformDto {
    @Field(isBoolean) enabled!: boolean;

    @Field(isString, {
      when: (obj: any) => obj.enabled === true,
      transform: ({ value }) => typeof value === 'string' ? value.toUpperCase() : value,
    })
    data!: string;
  }

  it('enabled=true → Transform executed + validated', async () => {
    const r = await deserialize(CondTransformDto, { enabled: true, data: 'hello' }) as CondTransformDto;
    expect(r.data).toBe('HELLO');
  });

  it('enabled=false → validation skipped (Transform may apply but validation does not)', async () => {
    const r = await deserialize(CondTransformDto, { enabled: false, data: 123 }) as CondTransformDto;
    // ValidateIf false → validation skipped so it passes
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
    // @ts-expect-error TS2612: overwriting base property is intentional for decorator test
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
    const r = await deserialize(GrandGrandChild, { name: 'alice' }) as GrandGrandChild;
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
