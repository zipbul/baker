import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { deserialize, Field, configure, isBakerError } from '../../index';
import type { BakerErrors } from '../../index';
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
    const result = await deserialize(SimpleDto, { name: 'Alice', age: 30 }) as SimpleDto;
    expect(result).toBeInstanceOf(SimpleDto);
    expect(result.name).toBe('Alice');
    expect(result.age).toBe(30);
  });

  it('should return BakerErrors when required string is missing', async () => {
    expect(isBakerError(await deserialize(SimpleDto, { age: 30 }))).toBe(true);
  });

  it('should return BakerErrors when type mismatch (number given as string)', async () => {
    expect(isBakerError(await deserialize(SimpleDto, { name: 123, age: 30 }))).toBe(true);
  });

  it('should accept optional field when absent', async () => {
    const result = await deserialize(OptionalFieldDto, { required: 'hello' }) as OptionalFieldDto;
    expect(result.required).toBe('hello');
    expect(result.optional).toBeUndefined();
  });

  it('should accept optional field when present with valid value', async () => {
    const result = await deserialize(OptionalFieldDto, { required: 'hi', optional: 'world' }) as OptionalFieldDto;
    expect(result.optional).toBe('world');
  });

  it('should deserialize boolean field', async () => {
    const result = await deserialize(BooleanDto, { active: true }) as BooleanDto;
    expect(result.active).toBe(true);
  });

  it('should return BakerErrors when boolean field receives string', async () => {
    expect(isBakerError(await deserialize(BooleanDto, { active: 'yes' }))).toBe(true);
  });

  // ── C3: ISIN / ISSN checksum validation via compiled executor ──────────────

  it('should return BakerErrors when @IsISIN field value passes regex but fails Luhn checksum', async () => {
    expect(isBakerError(await deserialize(IsinDto, { isin: 'US0378331006' }))).toBe(true);
  });

  it('should accept valid ISIN that passes both regex and Luhn checksum', async () => {
    const result = await deserialize(IsinDto, { isin: 'US0378331005' }) as IsinDto;
    expect(result.isin).toBe('US0378331005');
  });

  it('should return BakerErrors when @IsISSN field value passes regex but fails mod-11 checksum', async () => {
    expect(isBakerError(await deserialize(IssnDto, { issn: '0378-5950' }))).toBe(true);
  });

  it('should accept valid ISSN that passes both regex and mod-11 checksum', async () => {
    const result = await deserialize(IssnDto, { issn: '0378-5955' }) as IssnDto;
    expect(result.issn).toBe('0378-5955');
  });

  // ── H1: Internal variable name collision fields (var _out, var _errors, var _groups) ──

  it('should deserialize DTO when field name collides with internal variable "out"', async () => {
    const result = await deserialize(CollisionOutDto, { out: 'value' }) as CollisionOutDto;
    expect(result).toBeInstanceOf(CollisionOutDto);
    expect(result.out).toBe('value');
  });

  it('should deserialize DTO when field name collides with internal variable "errors"', async () => {
    const result = await deserialize(CollisionErrorsDto, { errors: 'none' }) as CollisionErrorsDto;
    expect(result).toBeInstanceOf(CollisionErrorsDto);
    expect(result.errors).toBe('none');
  });

  it('should deserialize DTO when field name collides with internal variable "groups"', async () => {
    const result = await deserialize(CollisionGroupsDto, { groups: 'g1' }) as CollisionGroupsDto;
    expect(result).toBeInstanceOf(CollisionGroupsDto);
    expect(result.groups).toBe('g1');
  });

  // ── C2: @IsDefined (now just @Field) ──────────────────────────────────────

  it('should return BakerErrors when @Field-only field receives undefined', async () => {
    expect(isBakerError(await deserialize(IsDefinedOnlyDto, { value: undefined }))).toBe(true);
  });

  it('should pass when @Field(isString) field receives empty string', async () => {
    const result = await deserialize(IsDefinedStringDto, { value: '' }) as IsDefinedStringDto;
    expect(result.value).toBe('');
  });

  it('should pass when @Field(isNumber()) field receives 0', async () => {
    const result = await deserialize(IsDefinedNumberDto, { value: 0 }) as IsDefinedNumberDto;
    expect(result.value).toBe(0);
  });

  // ── C4: NaN/Infinity gate ──────────────────────────────────────────────────

  it('should return BakerErrors when @Field(isNumber()) field receives NaN', async () => {
    expect(isBakerError(await deserialize(IsNumberOnlyDto, { value: NaN }))).toBe(true);
  });

  it('should return BakerErrors when @Field(isNumber()) field receives Infinity', async () => {
    expect(isBakerError(await deserialize(IsNumberOnlyDto, { value: Infinity }))).toBe(true);
  });

  it('should pass when @Field(isNumber({ allowNaN: true })) field receives NaN', async () => {
    const result = await deserialize(IsNumberAllowNaNDto, { value: NaN }) as IsNumberAllowNaNDto;
    expect(result.value).toBeNaN();
  });

  it('should pass when @Field(isNumber({ allowInfinity: true })) field receives Infinity', async () => {
    const result = await deserialize(IsNumberAllowInfinityDto, { value: Infinity }) as IsNumberAllowInfinityDto;
    expect(result.value).toBe(Infinity);
  });

  it('should assign NaN when @Field(min(0)) only field receives NaN (no isNumber gate)', async () => {
    const result = await deserialize(MinOnlyDto, { value: NaN }) as MinOnlyDto;
    expect(result.value).toBeNaN();
  });

  it('should return BakerErrors when @Field(isNumber(), min(0)) receives NaN', async () => {
    expect(isBakerError(await deserialize(IsNumberAndMinDto, { value: NaN }))).toBe(true);
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

  it('sync DTO failure returns BakerErrors (not a throw)', async () => {
    const result = await deserialize(SimpleDto, { name: 123, age: 'bad' });
    expect(isBakerError(result)).toBe(true);
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
    const result = await deserialize(MessageIntegrationDto, { name: 42 });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]!.message).toBe('Invalid name field');
    }
  });

  it('should return normally regardless of message on validation success', async () => {
    const result = await deserialize(MessageIntegrationDto, { name: 'Alice' }) as MessageIntegrationDto;
    expect(result.name).toBe('Alice');
  });
});

describe('deserialize — @Field context integration', () => {
  afterEach(() => unseal());

  it('should include value in BakerError.context on validation failure', async () => {
    const result = await deserialize(ContextIntegrationDto, { value: 'bad' });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]!.context).toEqual({ errorCode: 'E001' });
    }
  });
});

describe('M4 — validation groups runtime filtering', () => {
  afterEach(() => unseal());

  it('no groups provided → group-gated fields excluded (visibility control)', async () => {
    const result = await deserialize(AdminOnlyDto, { secret: 123, id: 1 }) as AdminOnlyDto;
    expect((result as any).secret).toBeUndefined();
  });

  it('groups match → field included + rules executed', async () => {
    expect(isBakerError(
      await deserialize(AdminOnlyDto, { secret: 123, id: 1 }, { groups: ['admin'] }),
    )).toBe(true);
  });

  it('groups mismatch → field excluded', async () => {
    const result = await deserialize(AdminOnlyDto, { secret: 123, id: 1 }, { groups: ['viewer'] }) as AdminOnlyDto;
    expect((result as any).secret).toBeUndefined();
  });

  it('fields without groups are always executed', async () => {
    expect(isBakerError(
      await deserialize(AdminOnlyDto, { secret: 'ok', id: 'not-a-number' as any }, { groups: ['viewer'] }),
    )).toBe(true);
  });
});
