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

// ── H1: Internal variable name collision DTOs ────────────────────────────

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

/** @Field alone — no other validation */
class IsDefinedOnlyDto {
  @Field()
  value!: any;
}

// ── C4: NaN/Infinity gate DTOs ───────────────────────────────────────────────

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

  // ── H1: Internal variable name collision fields (var _out, var _errors, var _groups) ──

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

  // ── C4: NaN/Infinity gate ──────────────────────────────────────────────────

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
// M4: validation groups runtime filtering
// ─────────────────────────────────────────────────────────────────────────────

class AdminOnlyDto {
  @Field(isString, { groups: ['admin'] })
  secret!: string;

  @Field(isNumber())
  id!: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync API — operates as a regular function, not an async function
// ─────────────────────────────────────────────────────────────────────────────

describe('deserialize — sync path', () => {
  afterEach(() => unseal());

  it('sync DTO returns via Promise.resolve, not async function', async () => {
    // Verify that deserialize itself is a regular function, not an async function
    expect(deserialize.constructor.name).not.toBe('AsyncFunction');
  });

  it('sync DTO success returns Promise<T> and await works correctly', async () => {
    const result = await deserialize(SimpleDto, { name: 'Test', age: 1 });
    expect(result).toBeInstanceOf(SimpleDto);
  });

  it('sync DTO failure returns rejected promise (not a synchronous throw)', () => {
    const promise = deserialize(SimpleDto, { name: 123, age: 'bad' });
    expect(promise).toBeInstanceOf(Promise);
    return expect(promise).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// @Field message/context — integration test
// ─────────────────────────────────────────────────────────────────────────────

class MessageIntegrationDto {
  @Field(isString, { message: 'Invalid name field' })
  name!: string;
}

class ContextIntegrationDto {
  @Field(isNumber(), { context: { errorCode: 'E001' } })
  value!: number;
}

describe('deserialize — @Field message integration', () => {
  afterEach(() => unseal());

  it('should include field-level message in BakerError.message on validation failure', async () => {
    try {
      await deserialize(MessageIntegrationDto, { name: 42 });
      expect.unreachable('should have thrown');
    } catch (e: any) {
      expect(e.errors.length).toBeGreaterThan(0);
      expect(e.errors[0].message).toBe('Invalid name field');
    }
  });

  it('should return normally regardless of message on validation success', async () => {
    const result = await deserialize(MessageIntegrationDto, { name: 'Alice' });
    expect(result.name).toBe('Alice');
  });
});

describe('deserialize — @Field context integration', () => {
  afterEach(() => unseal());

  it('should include value in BakerError.context on validation failure', async () => {
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

  it('no groups provided → group-gated fields excluded (visibility control)', async () => {
    // groups=['admin'] field → field itself is excluded when no runtime groups
    const result = await deserialize<AdminOnlyDto>(AdminOnlyDto, { secret: 123, id: 1 });
    expect((result as any).secret).toBeUndefined();
  });

  it('groups match → field included + rules executed', async () => {
    await expect(
      deserialize(AdminOnlyDto, { secret: 123, id: 1 }, { groups: ['admin'] }),
    ).rejects.toThrow();
  });

  it('groups mismatch → field excluded', async () => {
    // runtime group 'viewer' doesn't match 'admin' → field itself is excluded
    const result = await deserialize<AdminOnlyDto>(AdminOnlyDto, { secret: 123, id: 1 }, { groups: ['viewer'] });
    expect((result as any).secret).toBeUndefined();
  });

  it('fields without groups are always executed', async () => {
    // @Field(isNumber()) on id has no groups — always validated
    await expect(
      deserialize(AdminOnlyDto, { secret: 'ok', id: 'not-a-number' as any }, { groups: ['viewer'] }),
    ).rejects.toThrow();
  });
});
