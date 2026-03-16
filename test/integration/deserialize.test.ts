import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { deserialize, Field, configure } from '../../index';
import { isString, isNumber, isBoolean, isISIN, isISSN, min } from '../../src/rules/index';
import { unseal } from './helpers/unseal';

beforeEach(() => unseal());
afterEach(() => unseal());

// ─── DTOs ────────────────────────────────────────────────────────────────────

class SimpleDto {
  @Field(isString)
  name!: string;

  @Field(isNumber())
  age!: number;
}

class OptionalFieldDto {
  @Field(isString)
  required!: string;

  @Field(isString, { optional: true })
  optional?: string;
}

class BooleanDto {
  @Field(isBoolean)
  active!: boolean;
}

class IsinDto {
  @Field(isISIN)
  isin!: string;
}

class IssnDto {
  @Field(isISSN())
  issn!: string;
}

// ── H1: 내부 변수명 충돌 DTOs ─────────────────────────────────────────────

class CollisionOutDto {
  @Field(isString)
  out!: string;
}

class CollisionErrorsDto {
  @Field(isString)
  errors!: string;
}

class CollisionGroupsDto {
  @Field(isString)
  groups!: string;
}

// ── C2: @IsDefined DTOs ───────────────────────────────────────────────────────

class IsDefinedStringDto {
  @Field(isString)
  value!: string;
}

class IsDefinedOptionalDto {
  @Field(isString, { optional: true })
  value!: string;
}

class IsDefinedNumberDto {
  @Field(isNumber())
  value!: number;
}

/** @Field 단독 — 다른 validation 없음 */
class IsDefinedOnlyDto {
  @Field()
  value!: any;
}

// ── C4: NaN/Infinity 게이트 DTOs ──────────────────────────────────────────────

class IsNumberOnlyDto {
  @Field(isNumber())
  value!: number;
}

class IsNumberAllowNaNDto {
  @Field(isNumber({ allowNaN: true }))
  value!: number;
}

class IsNumberAllowInfinityDto {
  @Field(isNumber({ allowInfinity: true }))
  value!: number;
}

class MinOnlyDto {
  @Field(min(0))
  value!: number;
}

class IsNumberAndMinDto {
  @Field(isNumber(), min(0))
  value!: number;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('deserialize — integration', () => {
  it('should deserialize plain object → DTO instance with valid input', async () => {
    const result = await deserialize<SimpleDto>(SimpleDto, { name: 'Alice', age: 30 });
    expect(result).toBeInstanceOf(SimpleDto);
    expect(result.name).toBe('Alice');
    expect(result.age).toBe(30);
  });

  it('should throw BakerValidationError when required string is missing', async () => {
    await expect(deserialize(SimpleDto, { age: 30 })).rejects.toThrow();
  });

  it('should throw BakerValidationError when type mismatch (number given as string)', async () => {
    await expect(deserialize(SimpleDto, { name: 123, age: 30 })).rejects.toThrow();
  });

  it('should accept optional field when absent', async () => {
    const result = await deserialize<OptionalFieldDto>(OptionalFieldDto, { required: 'hello' });
    expect(result.required).toBe('hello');
    expect(result.optional).toBeUndefined();
  });

  it('should accept optional field when present with valid value', async () => {
    const result = await deserialize<OptionalFieldDto>(OptionalFieldDto, { required: 'hi', optional: 'world' });
    expect(result.optional).toBe('world');
  });

  it('should deserialize boolean field', async () => {
    const result = await deserialize<BooleanDto>(BooleanDto, { active: true });
    expect(result.active).toBe(true);
  });

  it('should throw when boolean field receives string', async () => {
    await expect(deserialize(BooleanDto, { active: 'yes' })).rejects.toThrow();
  });

  // ── C3: ISIN / ISSN checksum validation via compiled executor ──────────────

  it('should throw when @IsISIN field value passes regex but fails Luhn checksum', async () => {
    // US0378331006 matches ISIN format regex but has wrong check digit (valid: US0378331005)
    await expect(deserialize(IsinDto, { isin: 'US0378331006' })).rejects.toThrow();
  });

  it('should accept valid ISIN that passes both regex and Luhn checksum', async () => {
    const result = await deserialize<IsinDto>(IsinDto, { isin: 'US0378331005' });
    expect(result.isin).toBe('US0378331005');
  });

  it('should throw when @IsISSN field value passes regex but fails mod-11 checksum', async () => {
    // 0378-5950 matches ISSN format regex but has wrong check digit (valid: 0378-5955)
    await expect(deserialize(IssnDto, { issn: '0378-5950' })).rejects.toThrow();
  });

  it('should accept valid ISSN that passes both regex and mod-11 checksum', async () => {
    const result = await deserialize<IssnDto>(IssnDto, { issn: '0378-5955' });
    expect(result.issn).toBe('0378-5955');
  });

  // ── H1: 내부 변수명 충돌 필드 (var _out, var _errors, var _groups) ────────

  it('should deserialize DTO when field name collides with internal variable "out"', async () => {
    const result = await deserialize<CollisionOutDto>(CollisionOutDto, { out: 'value' });
    expect(result).toBeInstanceOf(CollisionOutDto);
    expect(result.out).toBe('value');
  });

  it('should deserialize DTO when field name collides with internal variable "errors"', async () => {
    const result = await deserialize<CollisionErrorsDto>(CollisionErrorsDto, { errors: 'none' });
    expect(result).toBeInstanceOf(CollisionErrorsDto);
    expect(result.errors).toBe('none');
  });

  it('should deserialize DTO when field name collides with internal variable "groups"', async () => {
    const result = await deserialize<CollisionGroupsDto>(CollisionGroupsDto, { groups: 'g1' });
    expect(result).toBeInstanceOf(CollisionGroupsDto);
    expect(result.groups).toBe('g1');
  });

  // ── C2: @IsDefined (now just @Field) ──────────────────────────────────────

  it('should throw when @Field-only field receives undefined', async () => {
    await expect(deserialize(IsDefinedOnlyDto, { value: undefined })).rejects.toThrow();
  });

  it('should pass when @Field(isString) field receives empty string', async () => {
    const result = await deserialize<IsDefinedStringDto>(IsDefinedStringDto, { value: '' });
    expect(result.value).toBe('');
  });

  it('should pass when @Field(isNumber()) field receives 0', async () => {
    const result = await deserialize<IsDefinedNumberDto>(IsDefinedNumberDto, { value: 0 });
    expect(result.value).toBe(0);
  });

  // ── C4: NaN/Infinity 게이트 ────────────────────────────────────────────────

  it('should throw when @Field(isNumber()) field receives NaN', async () => {
    await expect(deserialize(IsNumberOnlyDto, { value: NaN })).rejects.toThrow();
  });

  it('should throw when @Field(isNumber()) field receives Infinity', async () => {
    await expect(deserialize(IsNumberOnlyDto, { value: Infinity })).rejects.toThrow();
  });

  it('should pass when @Field(isNumber({ allowNaN: true })) field receives NaN', async () => {
    const result = await deserialize<IsNumberAllowNaNDto>(IsNumberAllowNaNDto, { value: NaN });
    expect(result.value).toBeNaN();
  });

  it('should pass when @Field(isNumber({ allowInfinity: true })) field receives Infinity', async () => {
    const result = await deserialize<IsNumberAllowInfinityDto>(IsNumberAllowInfinityDto, { value: Infinity });
    expect(result.value).toBe(Infinity);
  });

  it('should assign NaN when @Field(min(0)) only field receives NaN (no isNumber gate)', async () => {
    const result = await deserialize<MinOnlyDto>(MinOnlyDto, { value: NaN });
    expect(result.value).toBeNaN();
  });

  it('should throw isNumber error when @Field(isNumber(), min(0)) receives NaN', async () => {
    await expect(deserialize(IsNumberAndMinDto, { value: NaN })).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// M4: validation groups 런타임 필터링
// ─────────────────────────────────────────────────────────────────────────────

class AdminOnlyDto {
  @Field(isString, { groups: ['admin'] })
  secret!: string;

  @Field(isNumber())
  id!: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync API — async function 아닌 일반 함수로 동작
// ─────────────────────────────────────────────────────────────────────────────

describe('deserialize — sync path', () => {
  afterEach(() => unseal());

  it('sync DTO는 async function 아닌 Promise.resolve로 반환', async () => {
    // deserialize 자체가 async function이 아닌 일반 함수인지 확인
    expect(deserialize.constructor.name).not.toBe('AsyncFunction');
  });

  it('sync DTO 성공 시 Promise<T> 반환 + await 정상 동작', async () => {
    const result = await deserialize(SimpleDto, { name: 'Test', age: 1 });
    expect(result).toBeInstanceOf(SimpleDto);
  });

  it('sync DTO 실패 시 rejected promise (동기 throw 아님)', () => {
    const promise = deserialize(SimpleDto, { name: 123, age: 'bad' });
    expect(promise).toBeInstanceOf(Promise);
    return expect(promise).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// @Field message/context — 통합 테스트
// ─────────────────────────────────────────────────────────────────────────────

class MessageIntegrationDto {
  @Field(isString, { message: 'Invalid name field' })
  name!: string;
}

class ContextIntegrationDto {
  @Field(isNumber(), { context: { errorCode: 'E001' } })
  value!: number;
}

describe('deserialize — @Field message 통합', () => {
  afterEach(() => unseal());

  it('검증 실패 시 BakerError.message에 필드 레벨 메시지 포함', async () => {
    try {
      await deserialize(MessageIntegrationDto, { name: 42 });
      expect.unreachable('should have thrown');
    } catch (e: any) {
      expect(e.errors.length).toBeGreaterThan(0);
      expect(e.errors[0].message).toBe('Invalid name field');
    }
  });

  it('검증 성공 시 message 무관 정상 반환', async () => {
    const result = await deserialize(MessageIntegrationDto, { name: 'Alice' });
    expect(result.name).toBe('Alice');
  });
});

describe('deserialize — @Field context 통합', () => {
  afterEach(() => unseal());

  it('검증 실패 시 BakerError.context에 값 포함', async () => {
    try {
      await deserialize(ContextIntegrationDto, { value: 'bad' });
      expect.unreachable('should have thrown');
    } catch (e: any) {
      expect(e.errors.length).toBeGreaterThan(0);
      expect(e.errors[0].context).toEqual({ errorCode: 'E001' });
    }
  });
});

describe('M4 — validation groups runtime filtering', () => {
  afterEach(() => unseal());

  it('groups 미제공 → groups 필드 제외 (가시성 제어)', async () => {
    // groups=['admin'] 필드 → 런타임 groups 없으면 필드 자체가 제외
    const result = await deserialize<AdminOnlyDto>(AdminOnlyDto, { secret: 123, id: 1 });
    expect((result as any).secret).toBeUndefined();
  });

  it('groups 일치 → 필드 포함 + 규칙 실행', async () => {
    await expect(
      deserialize(AdminOnlyDto, { secret: 123, id: 1 }, { groups: ['admin'] }),
    ).rejects.toThrow();
  });

  it('groups 불일치 → 필드 제외', async () => {
    // runtime group 'viewer' doesn't match 'admin' → 필드 자체가 제외
    const result = await deserialize<AdminOnlyDto>(AdminOnlyDto, { secret: 123, id: 1 }, { groups: ['viewer'] });
    expect((result as any).secret).toBeUndefined();
  });

  it('groups 없는 필드는 항상 실행', async () => {
    // @Field(isNumber()) on id has no groups — always validated
    await expect(
      deserialize(AdminOnlyDto, { secret: 'ok', id: 'not-a-number' as any }, { groups: ['viewer'] }),
    ).rejects.toThrow();
  });
});
