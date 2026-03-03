import { describe, it, expect, afterEach } from 'bun:test';
import {
  seal, deserialize, toJsonSchema,
  IsString, IsNumber, IsInt, IsBoolean, IsDate, IsEnum, IsArray, IsObject,
  IsOptional, IsDefined, IsNullable,
  Min, Max, IsPositive, IsNegative,
  MinLength, MaxLength, IsEmail, IsUUID, IsIP, IsISO8601,
  Equals, NotEquals, IsIn, IsNotIn,
  ArrayMinSize, ArrayMaxSize, ArrayUnique, ArrayNotEmpty, ArrayContains,
  IsNotEmptyObject, Matches,
  Expose, Exclude, Schema, Nested,
} from '../../index';
import { unseal } from '../integration/helpers/unseal';
import type { JsonSchema202012 } from '../../index';

afterEach(() => unseal());

// ═════════════════════════════════════════════════════════════════════════════
// 타입 매핑
// ═════════════════════════════════════════════════════════════════════════════

describe('toJsonSchema 타입 매핑', () => {
  class TypesDto {
    @IsString()  str!: string;
    @IsNumber()  num!: number;
    @IsInt()     int!: number;
    @IsBoolean() bool!: boolean;
    @IsDate()    date!: Date;
    @IsArray()   arr!: unknown[];
    @IsObject()  obj!: object;
  }

  it('기본 타입 → JSON Schema type', () => {
    const s = toJsonSchema(TypesDto);
    expect(s.properties!.str).toEqual({ type: 'string' });
    expect(s.properties!.num).toEqual({ type: 'number' });
    expect(s.properties!.int).toEqual({ type: 'integer' });
    expect(s.properties!.bool).toEqual({ type: 'boolean' });
    expect(s.properties!.date).toEqual({ type: 'string', format: 'date-time' });
    expect(s.properties!.arr).toEqual({ type: 'array' });
    expect(s.properties!.obj).toEqual({ type: 'object' });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// enum / const
// ═════════════════════════════════════════════════════════════════════════════

describe('toJsonSchema enum/const', () => {
  enum Role { Admin = 'admin', User = 'user' }

  class EnumDto {
    @IsEnum(Role)   role!: Role;
    @IsIn(['a','b']) status!: string;
    @Equals('fixed') type!: string;
  }

  it('enum, isIn, equals 매핑', () => {
    const s = toJsonSchema(EnumDto);
    expect(s.properties!.role).toEqual({ enum: ['admin', 'user'] });
    expect(s.properties!.status).toEqual({ enum: ['a', 'b'] });
    expect(s.properties!.type).toEqual({ const: 'fixed' });
  });

  class NegDto {
    @NotEquals('bad') val1!: unknown;
    @IsNotIn([1,2])   val2!: unknown;
  }

  it('notEquals, isNotIn 매핑', () => {
    const s = toJsonSchema(NegDto);
    expect(s.properties!.val1).toEqual({ not: { const: 'bad' } });
    expect(s.properties!.val2).toEqual({ not: { enum: [1, 2] } });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 숫자 제약
// ═════════════════════════════════════════════════════════════════════════════

describe('toJsonSchema 숫자', () => {
  class NumDto {
    @IsNumber() @Min(0) @Max(100) range!: number;
    @IsPositive()  pos!: number;
    @IsNegative()  neg!: number;
  }

  it('min/max, isPositive, isNegative', () => {
    const s = toJsonSchema(NumDto);
    expect(s.properties!.range).toEqual({ type: 'number', minimum: 0, maximum: 100 });
    expect(s.properties!.pos).toEqual({ exclusiveMinimum: 0 });
    expect(s.properties!.neg).toEqual({ exclusiveMaximum: 0 });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 문자열 제약 + format
// ═════════════════════════════════════════════════════════════════════════════

describe('toJsonSchema 문자열 + format', () => {
  class StrDto {
    @IsString() @MinLength(1) @MaxLength(50) name!: string;
    @IsString() @Matches(/^[a-z-]+$/) slug!: string;
    @IsEmail()   email!: string;
    @IsUUID()    uuid!: string;
    @IsISO8601() ts!: string;
    @IsIP(4)     ip4!: string;
    @IsIP(6)     ip6!: string;
    @IsIP()      ipAny!: string;
  }

  it('문자열 constraints + format 매핑', () => {
    const s = toJsonSchema(StrDto);
    expect(s.properties!.name).toEqual({ type: 'string', minLength: 1, maxLength: 50 });
    expect(s.properties!.slug.pattern).toBe('^[a-z-]+$');
    expect(s.properties!.email).toEqual({ format: 'email' });
    expect(s.properties!.uuid).toEqual({ format: 'uuid' });
    expect(s.properties!.ts).toEqual({ format: 'date-time' });
    expect(s.properties!.ip4).toEqual({ format: 'ipv4' });
    expect(s.properties!.ip6).toEqual({ format: 'ipv6' });
    // @IsIP() 버전 미지정 → format 매핑 없음
    expect(s.properties!.ipAny.format).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 배열 제약
// ═════════════════════════════════════════════════════════════════════════════

describe('toJsonSchema 배열', () => {
  class ArrDto {
    @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @ArrayUnique() tags!: string[];
    @ArrayNotEmpty() items!: unknown[];
    @ArrayContains(['a','b']) must!: string[];
  }

  it('배열 constraints 매핑', () => {
    const s = toJsonSchema(ArrDto);
    expect(s.properties!.tags).toEqual({
      type: 'array', minItems: 1, maxItems: 10, uniqueItems: true,
    });
    expect(s.properties!.items).toEqual({ minItems: 1 });
    expect(s.properties!.must).toEqual({ contains: { enum: ['a', 'b'] } });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// each:true → items 서브스키마
// ═════════════════════════════════════════════════════════════════════════════

describe('toJsonSchema each:true', () => {
  class EachDto {
    @IsArray()
    @ArrayMinSize(1)
    @IsString({ each: true })
    @MinLength(1, { each: true })
    names!: string[];
  }

  it('each 룰 → items에 매핑, non-each → 배열 레벨', () => {
    const s = toJsonSchema(EachDto);
    expect(s.properties!.names).toEqual({
      type: 'array',
      minItems: 1,
      items: { type: 'string', minLength: 1 },
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// @Expose / @Exclude direction
// ═════════════════════════════════════════════════════════════════════════════

describe('toJsonSchema direction', () => {
  class DirDto {
    @IsString()
    @Expose({ name: 'user_name', deserializeOnly: true })
    @Expose({ name: 'userName', serializeOnly: true })
    name!: string;

    @IsString()
    @Exclude({ serializeOnly: true })
    password!: string;

    @IsString()
    @Exclude()
    internal!: string;
  }

  it('direction: deserialize', () => {
    const s = toJsonSchema(DirDto, { direction: 'deserialize' });
    expect(s.properties!.user_name).toBeDefined();
    expect(s.properties!.userName).toBeUndefined();
    expect(s.properties!.password).toBeDefined();
    expect(s.properties!.internal).toBeUndefined();
  });

  it('direction: serialize', () => {
    const s = toJsonSchema(DirDto, { direction: 'serialize' });
    expect(s.properties!.userName).toBeDefined();
    expect(s.properties!.user_name).toBeUndefined();
    expect(s.properties!.password).toBeUndefined();
    expect(s.properties!.internal).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// @Schema
// ═════════════════════════════════════════════════════════════════════════════

describe('toJsonSchema @Schema', () => {
  @Schema({ title: 'CreateUser', description: 'Creates a user' })
  class TitledDto {
    @IsString()
    @Schema({ description: 'Display name', minLength: 3 })
    @MinLength(1)
    name!: string;

    @IsString()
    @Schema({ allOf: [{ minLength: 1 }, { maxLength: 100 }] })
    composed!: string;

    @IsString()
    @Schema((auto: JsonSchema202012) => ({
      ...auto,
      examples: ['hello'],
    }))
    custom!: string;
  }

  it('클래스 레벨 → 루트에 병합', () => {
    const s = toJsonSchema(TitledDto);
    expect(s.title).toBe('CreateUser');
    expect(s.description).toBe('Creates a user');
  });

  it('프로퍼티 레벨 객체형 → 오버라이드', () => {
    const s = toJsonSchema(TitledDto);
    expect(s.properties!.name.minLength).toBe(3); // @Schema가 자동 매핑 1을 오버라이드
    expect(s.properties!.name.description).toBe('Display name');
  });

  it('composition-aware → 자동 매핑 억제', () => {
    const s = toJsonSchema(TitledDto);
    expect(s.properties!.composed.type).toBeUndefined();
    expect(s.properties!.composed.allOf).toBeDefined();
  });

  it('함수형 @Schema', () => {
    const s = toJsonSchema(TitledDto);
    expect(s.properties!.custom.type).toBe('string');
    expect(s.properties!.custom.examples).toEqual(['hello']);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// groups
// ═════════════════════════════════════════════════════════════════════════════

describe('toJsonSchema groups', () => {
  class GroupDto {
    @IsString() name!: string;

    @IsString()
    @Expose({ groups: ['admin'] })
    secret!: string;

    @IsNumber()
    @Min(0, { groups: ['create'] })
    @Max(100, { groups: ['update'] })
    score!: number;
  }

  it('expose groups 불일치 → 필드 제외', () => {
    const s = toJsonSchema(GroupDto, { groups: ['user'] });
    expect(s.properties!.name).toBeDefined();
    expect(s.properties!.secret).toBeUndefined();
  });

  it('rule groups 필터링', () => {
    const create = toJsonSchema(GroupDto, { groups: ['create'] });
    expect(create.properties!.score.minimum).toBe(0);
    expect(create.properties!.score.maximum).toBeUndefined();

    const update = toJsonSchema(GroupDto, { groups: ['update'] });
    expect(update.properties!.score.maximum).toBe(100);
    expect(update.properties!.score.minimum).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 순환 참조
// ═════════════════════════════════════════════════════════════════════════════

describe('toJsonSchema 순환 참조', () => {
  class TreeNode {
    @IsString() value!: string;

    @IsOptional()
    @Nested(() => TreeNode)
    child?: TreeNode;
  }

  it('자기 참조 → $ref + $defs', () => {
    const s = toJsonSchema(TreeNode);
    expect(s.properties!.child).toEqual({ $ref: '#/$defs/TreeNode' });
    expect(s.$defs!.TreeNode).toBeDefined();
    expect(s.$defs!.TreeNode.properties!.value).toEqual({ type: 'string' });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// @IsOptional과 required
// ═════════════════════════════════════════════════════════════════════════════

describe('toJsonSchema @IsOptional → required 제외', () => {
  class OptDto {
    @IsString() name!: string;
    @IsOptional() @IsNumber() age?: number;
  }

  it('required에 name만 포함, age 제외', () => {
    const s = toJsonSchema(OptDto);
    expect(s.required).toContain('name');
    expect(s.required).not.toContain('age');
  });

  it('age 프로퍼티는 스키마에 존재', () => {
    const s = toJsonSchema(OptDto);
    expect(s.properties!.age).toBeDefined();
    expect(s.properties!.age.type).toBe('number');
  });
});
