import { describe, it, expect, afterEach } from 'bun:test';
import { Field, deserialize, BakerValidationError } from '../../index';
import { isString, minLength, isNumber, isEmail } from '../../src/rules/index';
import { arrayOf } from '../../src/decorators/field';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─── DTOs ────────────────────────────────────────────────────────────────────

class StringMessageDto {
  @Field(isString, minLength(3), { message: 'Name is invalid' })
  name!: string;
}

class FunctionMessageDto {
  @Field(isString, {
    message: ({ property, value }) => `${property} got bad value: ${JSON.stringify(value)}`,
  })
  email!: string;
}

class ContextDto {
  @Field(isString, { context: { severity: 'warning', field: 'tag' } })
  tag!: string;
}

class MessageAndContextDto {
  @Field(isNumber(), { message: 'Must be a number', context: { hint: 'use integer' } })
  count!: number;
}

class MultiRuleMessageDto {
  @Field(isString, minLength(5), { message: 'Username invalid' })
  username!: string;
}

class ArrayOfMessageDto {
  @Field(arrayOf(isString, minLength(1)), { message: 'Each tag must be a non-empty string' })
  tags!: string[];
}

class NoMessageDto {
  @Field(isString)
  name!: string;
}

class FalsyContextZeroDto {
  @Field(isString, { context: 0 })
  value!: string;
}

class FalsyContextFalseDto {
  @Field(isString, { context: false })
  value!: string;
}

class FalsyContextEmptyStringDto {
  @Field(isString, { context: '' })
  value!: string;
}

class EmptyStringMessageDto {
  @Field(isString, { message: '' })
  value!: string;
}

class ConstraintsAccessDto {
  @Field(minLength(5), {
    message: ({ property, constraints }) =>
      `${property} must be at least ${constraints['min']} chars`,
  })
  name!: string;
}

class GroupsWithMessageDto {
  @Field(isString, { groups: ['admin'], message: 'Admin field invalid' })
  secret!: string;

  @Field(isNumber())
  id!: number;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('@Field message option — string', () => {
  it('validation failure includes string in BakerError.message', async () => {
    try {
      await deserialize(StringMessageDto, { name: 42 });
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(BakerValidationError);
      const err = e as BakerValidationError;
      expect(err.errors.length).toBeGreaterThan(0);
      expect(err.errors[0]!.message).toBe('Name is invalid');
    }
  });

  it('minLength failure also includes message', async () => {
    try {
      await deserialize(StringMessageDto, { name: 'ab' });
      expect.unreachable('should have thrown');
    } catch (e) {
      const err = e as BakerValidationError;
      const minLenErr = err.errors.find(e => e.code === 'minLength');
      expect(minLenErr).toBeDefined();
      expect(minLenErr!.message).toBe('Name is invalid');
    }
  });
});

describe('@Field message option — function', () => {
  it('validation failure calls function for dynamic message', async () => {
    try {
      await deserialize(FunctionMessageDto, { email: 123 });
      expect.unreachable('should have thrown');
    } catch (e) {
      const err = e as BakerValidationError;
      expect(err.errors.length).toBeGreaterThan(0);
      expect(err.errors[0]!.message).toBe('email got bad value: 123');
    }
  });
});

describe('@Field context option', () => {
  it('validation failure includes value in BakerError.context', async () => {
    try {
      await deserialize(ContextDto, { tag: 999 });
      expect.unreachable('should have thrown');
    } catch (e) {
      const err = e as BakerValidationError;
      expect(err.errors.length).toBeGreaterThan(0);
      expect(err.errors[0]!.context).toEqual({ severity: 'warning', field: 'tag' });
    }
  });
});

describe('@Field message + context used together', () => {
  it('both message and context included in error', async () => {
    try {
      await deserialize(MessageAndContextDto, { count: 'not a number' });
      expect.unreachable('should have thrown');
    } catch (e) {
      const err = e as BakerValidationError;
      expect(err.errors.length).toBeGreaterThan(0);
      expect(err.errors[0]!.message).toBe('Must be a number');
      expect(err.errors[0]!.context).toEqual({ hint: 'use integer' });
    }
  });
});

describe('@Field message — applied to all rules uniformly', () => {
  it('same message applied to all rule failures for the field', async () => {
    try {
      await deserialize(MultiRuleMessageDto, { username: 42 });
      expect.unreachable('should have thrown');
    } catch (e) {
      const err = e as BakerValidationError;
      for (const error of err.errors) {
        expect(error.message).toBe('Username invalid');
      }
    }
  });
});

describe('@Field message — used with arrayOf', () => {
  it('message applied to each rule failures', async () => {
    try {
      await deserialize(ArrayOfMessageDto, { tags: ['valid', '', 42] });
      expect.unreachable('should have thrown');
    } catch (e) {
      const err = e as BakerValidationError;
      expect(err.errors.length).toBeGreaterThan(0);
      for (const error of err.errors) {
        expect(error.message).toBe('Each tag must be a non-empty string');
      }
    }
  });
});

describe('@Field message not set', () => {
  it('error object does not have message property', async () => {
    try {
      await deserialize(NoMessageDto, { name: 42 });
      expect.unreachable('should have thrown');
    } catch (e) {
      const err = e as BakerValidationError;
      expect('message' in err.errors[0]!).toBe(false);
    }
  });

  it('error object does not have context property', async () => {
    try {
      await deserialize(NoMessageDto, { name: 42 });
      expect.unreachable('should have thrown');
    } catch (e) {
      const err = e as BakerValidationError;
      expect('context' in err.errors[0]!).toBe(false);
    }
  });
});

describe('@Field context — falsy value handling', () => {
  it('context: 0 → 0 included in error', async () => {
    try {
      await deserialize(FalsyContextZeroDto, { value: 42 });
      expect.unreachable('should have thrown');
    } catch (e) {
      const err = e as BakerValidationError;
      expect(err.errors[0]!.context).toBe(0);
    }
  });

  it('context: false → false included in error', async () => {
    try {
      await deserialize(FalsyContextFalseDto, { value: 42 });
      expect.unreachable('should have thrown');
    } catch (e) {
      const err = e as BakerValidationError;
      expect(err.errors[0]!.context).toBe(false);
    }
  });

  it('context: "" → empty string included in error', async () => {
    try {
      await deserialize(FalsyContextEmptyStringDto, { value: 42 });
      expect.unreachable('should have thrown');
    } catch (e) {
      const err = e as BakerValidationError;
      expect(err.errors[0]!.context).toBe('');
    }
  });
});

describe('@Field message — empty string', () => {
  it('message: "" → empty string included in error', async () => {
    try {
      await deserialize(EmptyStringMessageDto, { value: 42 });
      expect.unreachable('should have thrown');
    } catch (e) {
      const err = e as BakerValidationError;
      expect(err.errors[0]!.message).toBe('');
    }
  });
});

describe('@Field message function — constraints access', () => {
  it('reads rule parameters from constraints object', async () => {
    try {
      await deserialize(ConstraintsAccessDto, { name: 'ab' });
      expect.unreachable('should have thrown');
    } catch (e) {
      const err = e as BakerValidationError;
      expect(err.errors.length).toBeGreaterThan(0);
      // minLength(5) should have constraints with min: 5
      expect(err.errors[0]!.message).toContain('5');
    }
  });
});

describe('@Field message + groups combination', () => {
  it('groups match → message included', async () => {
    try {
      await deserialize(GroupsWithMessageDto, { secret: 42, id: 1 }, { groups: ['admin'] });
      expect.unreachable('should have thrown');
    } catch (e) {
      const err = e as BakerValidationError;
      const secretErr = err.errors.find(e => e.path === 'secret');
      expect(secretErr).toBeDefined();
      expect(secretErr!.message).toBe('Admin field invalid');
    }
  });

  it('groups mismatch → field itself excluded → no error', async () => {
    const result = await deserialize(GroupsWithMessageDto, { secret: 42, id: 1 }, { groups: ['viewer'] });
    expect((result as any).secret).toBeUndefined();
    expect(result.id).toBe(1);
  });
});
