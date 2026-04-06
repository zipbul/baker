import { describe, it, expect } from 'bun:test';
import { validate, deserialize, isBakerError, Field, createRule } from '../../index';
import {
  isString, isNumber, isBoolean, isEmail, min, max, minLength,
} from '../../src/rules/index';

// ─────────────────────────────────────────────────────────────────────────────
// Ad-hoc validation — single value + rules
// ─────────────────────────────────────────────────────────────────────────────

describe('validate ad-hoc — sync rules', () => {
  it('single rule pass → true', async () => {
    expect(await validate('hello', isString)).toBe(true);
  });

  it('single rule fail → BakerErrors with code', async () => {
    const result = await validate(123, isString);
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors).toEqual([{ path: '', code: 'isString' }]);
    }
  });

  it('multiple rules all pass → true', async () => {
    expect(await validate('hello@test.com', isString, minLength(3), isEmail())).toBe(true);
  });

  it('multiple rules partial fail → BakerErrors with failed codes only', async () => {
    const result = await validate('ab', isString, minLength(3), isEmail());
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]!.code).toBe('minLength');
      expect(result.errors[1]!.code).toBe('isEmail');
    }
  });

  it('multiple rules all fail → BakerErrors with all codes', async () => {
    const result = await validate(42, isString, minLength(3), isEmail());
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors).toHaveLength(3);
    }
  });

  it('number validation with min/max', async () => {
    expect(await validate(50, isNumber(), min(0), max(100))).toBe(true);
    const result = await validate(-5, isNumber(), min(0));
    expect(isBakerError(result)).toBe(true);
  });

  it('boolean validation', async () => {
    expect(await validate(true, isBoolean)).toBe(true);
    const result = await validate('true', isBoolean);
    expect(isBakerError(result)).toBe(true);
  });

  it('factory rule isEmail()', async () => {
    expect(await validate('a@b.com', isEmail())).toBe(true);
    const result = await validate('not-email', isEmail());
    expect(isBakerError(result)).toBe(true);
  });

  it('error path is empty string for ad-hoc', async () => {
    const result = await validate(123, isString);
    if (isBakerError(result)) {
      expect(result.errors[0]!.path).toBe('');
    }
  });

  it('sync rules return directly', () => {
    const result = validate('hello', isString);
    expect(result).toBe(true);
  });
});

describe('validate ad-hoc — async rules', () => {
  const asyncPass = createRule({
    name: 'asyncPass',
    validate: async (v) => typeof v === 'string',
  });

  const asyncFail = createRule({
    name: 'asyncFail',
    validate: async () => false,
  });

  it('async rule pass → true', async () => {
    expect(await validate('hello', asyncPass)).toBe(true);
  });

  it('async rule fail → BakerErrors', async () => {
    const result = await validate('hello', asyncFail);
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors[0]!.code).toBe('asyncFail');
    }
  });

  it('mixed sync + async rules', async () => {
    const result = await validate(123, isString, asyncPass);
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]!.code).toBe('isString');
      expect(result.errors[1]!.code).toBe('asyncPass');
    }
  });

  it('returns Promise for async rules', () => {
    const result = validate('hello', asyncPass);
    expect(result).toBeInstanceOf(Promise);
  });

  it('promise-returning non-async rule throws contract error', () => {
    const promiseFalse = createRule({
      name: 'promiseFalse',
      validate: () => Promise.resolve(false),
    });

    expect(() => validate('hello', promiseFalse)).toThrow('sync rule returned Promise');
  });
});

describe('validate ad-hoc — edge cases', () => {
  it('null input fails isString', async () => {
    const result = await validate(null, isString);
    expect(isBakerError(result)).toBe(true);
  });

  it('undefined input fails isNumber', async () => {
    const result = await validate(undefined, isNumber());
    expect(isBakerError(result)).toBe(true);
  });

  it('empty string passes isString but fails minLength(1)', async () => {
    expect(await validate('', isString)).toBe(true);
    const result = await validate('', isString, minLength(1));
    expect(isBakerError(result)).toBe(true);
  });

  it('createRule with simple form', async () => {
    const isEven = createRule('isEven', (v) => typeof v === 'number' && (v as number) % 2 === 0);
    expect(await validate(4, isEven)).toBe(true);
    const result = await validate(3, isEven);
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors[0]!.code).toBe('isEven');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DTO-level validation
// ─────────────────────────────────────────────────────────────────────────────

class SimpleDto {
  @Field(isString, minLength(2)) name!: string;
  @Field(isNumber(), min(0), max(150)) age!: number;
  @Field(isString, isEmail()) email!: string;
}

class NestedAddressDto {
  @Field(isString, minLength(1)) city!: string;
}

class NestedUserDto {
  @Field(isString) name!: string;
  @Field({ type: () => NestedAddressDto }) address!: NestedAddressDto;
}

describe('validate DTO — basic', () => {
  it('valid input → true', async () => {
    expect(await validate(SimpleDto, { name: 'Alice', age: 30, email: 'a@b.com' })).toBe(true);
  });

  it('invalid input → BakerErrors with field paths', async () => {
    const result = await validate(SimpleDto, { name: 'A', age: -5, email: 'bad' });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      const codes = result.errors.map(e => e.code);
      expect(codes).toContain('minLength');
      expect(codes).toContain('min');
      expect(codes).toContain('isEmail');
    }
  });

  it('wrong types → BakerErrors', async () => {
    const result = await validate(SimpleDto, { name: 123, age: 'bad', email: 42 });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('missing fields → BakerErrors', async () => {
    const result = await validate(SimpleDto, {});
    expect(isBakerError(result)).toBe(true);
  });

  it('null input → BakerErrors with invalidInput code', async () => {
    const result = await validate(SimpleDto, null);
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors[0]!.code).toBe('invalidInput');
    }
  });

  it('array input → BakerErrors with invalidInput code', async () => {
    const result = await validate(SimpleDto, [1, 2, 3]);
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors[0]!.code).toBe('invalidInput');
    }
  });

  it('sync DTO returns directly', () => {
    const result = validate(SimpleDto, { name: 'Alice', age: 30, email: 'a@b.com' });
    expect(result).toBe(true);
  });
});

describe('validate DTO — nested', () => {
  it('valid nested → true', async () => {
    expect(await validate(NestedUserDto, { name: 'Bob', address: { city: 'Seoul' } })).toBe(true);
  });

  it('invalid nested field → BakerErrors with nested path', async () => {
    const result = await validate(NestedUserDto, { name: 'Bob', address: { city: '' } });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      const paths = result.errors.map(e => e.path);
      expect(paths.some(p => p.includes('address'))).toBe(true);
    }
  });
});

describe('validate DTO — consistency with deserialize', () => {
  it('validate returns true when deserialize succeeds', async () => {
    const input = { name: 'Alice', age: 30, email: 'alice@test.com' };
    const vResult = await validate(SimpleDto, input);
    const dResult = await deserialize(SimpleDto, input);
    expect(vResult).toBe(true);
    expect(isBakerError(dResult)).toBe(false);
  });

  it('validate returns BakerErrors when deserialize returns BakerErrors', async () => {
    const input = { name: 'A', age: -1, email: 'bad' };
    const vResult = await validate(SimpleDto, input);
    const dResult = await deserialize(SimpleDto, input);
    expect(isBakerError(vResult)).toBe(true);
    expect(isBakerError(dResult)).toBe(true);
  });

  it('same error codes from validate and deserialize', async () => {
    const input = { name: 123, age: 'x', email: 42 };
    const vResult = await validate(SimpleDto, input);
    const dResult = await deserialize(SimpleDto, input);
    if (isBakerError(vResult) && isBakerError(dResult)) {
      const vCodes = vResult.errors.map(e => `${e.path}:${e.code}`).sort();
      const dCodes = dResult.errors.map(e => `${e.path}:${e.code}`).sort();
      expect(vCodes).toEqual(dCodes);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Overload resolution
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// DTO-level — advanced scenarios
// ─────────────────────────────────────────────────────────────────────────────

describe('validate DTO — groups', () => {
  class GroupDto {
    @Field(isString) name!: string;
    @Field(isString, { groups: ['admin'] }) secret!: string;
  }

  it('without groups → validates non-group fields only', async () => {
    expect(await validate(GroupDto, { name: 'Alice' })).toBe(true);
  });

  it('with groups → validates group fields too → passes when provided', async () => {
    expect(await validate(GroupDto, { name: 'Alice', secret: 'key' }, { groups: ['admin'] })).toBe(true);
  });

  it('with groups → missing group field → fails', async () => {
    const result = await validate(GroupDto, { name: 'Alice' }, { groups: ['admin'] });
    expect(isBakerError(result)).toBe(true);
  });
});

describe('validate DTO — optional/nullable', () => {
  class OptionalDto {
    @Field(isString, { optional: true }) nickname?: string;
    @Field(isString) name!: string;
  }

  it('optional field missing → passes', async () => {
    expect(await validate(OptionalDto, { name: 'Alice' })).toBe(true);
  });

  it('optional field present but invalid → fails', async () => {
    const result = await validate(OptionalDto, { name: 'Alice', nickname: 123 });
    expect(isBakerError(result)).toBe(true);
  });
});

describe('validate DTO — async', () => {
  class AsyncDto {
    @Field(isString, {
      transform: { deserialize: async ({ value }) => (value as string).trim(), serialize: ({ value }) => value },
    }) name!: string;
  }

  it('async DTO valid → true', async () => {
    expect(await validate(AsyncDto, { name: '  Alice  ' })).toBe(true);
  });

  it('async DTO missing field → BakerErrors', async () => {
    const result = await validate(AsyncDto, {});
    expect(isBakerError(result)).toBe(true);
  });
});

describe('validate DTO — SealError', () => {
  it('class without @Field → throws SealError', () => {
    class EmptyDto {}
    expect(() => validate(EmptyDto, {})).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Ad-hoc — edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('validate ad-hoc — no rules', () => {
  it('no rules passed → true (vacuously valid)', async () => {
    expect(await validate('anything')).toBe(true);
  });

  it('no rules with null → true', async () => {
    expect(await validate(null)).toBe(true);
  });
});

describe('validate ad-hoc — throwing rule', () => {
  const throwRule = createRule('throwRule', () => { throw new Error('boom'); });

  it('sync rule that throws → throws the same error', () => {
    expect(() => validate('hello', throwRule)).toThrow('boom');
  });

  it('async rule that throws → rejects with the thrown error', async () => {
    const asyncThrow = createRule({
      name: 'asyncThrow',
      validate: async () => { throw new Error('async boom'); },
    });
    await expect(validate('hello', asyncThrow)).rejects.toThrow('async boom');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Overload resolution
// ─────────────────────────────────────────────────────────────────────────────

describe('validate overload resolution', () => {
  it('function + plain object → DTO mode', async () => {
    const result = await validate(SimpleDto, { name: 'Alice', age: 30, email: 'a@b.com' });
    expect(result).toBe(true);
  });

  it('function + EmittableRule → ad-hoc mode (validates function value)', async () => {
    const fn = () => {};
    const result = await validate(fn, isString);
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors[0]!.code).toBe('isString');
    }
  });

  it('string + rules → ad-hoc mode', async () => {
    expect(await validate('hello', isString)).toBe(true);
  });

  it('number + rules → ad-hoc mode', async () => {
    expect(await validate(42, isNumber())).toBe(true);
  });
});
