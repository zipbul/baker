import { describe, it, expect, afterEach } from 'bun:test';
import { Field, deserialize, isBakerError } from '../../index';
import type { BakerErrors } from '../../index';
import { isString, minLength, isNumber } from '../../src/rules/index';
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

class InnerMsgDto {
  @Field(isString, { message: 'inner msg' })
  name!: string;
}

class OuterMsgDto {
  @Field({ type: () => InnerMsgDto })
  child!: InnerMsgDto;
}

class InnerCtxDto {
  @Field(isNumber(), { message: 'must be number', context: { severity: 'error' } })
  age!: number;
}

class OuterCtxDto {
  @Field({ type: () => InnerCtxDto })
  nested!: InnerCtxDto;
}

class InnerArrayMsgDto {
  @Field(isString, { message: 'item msg' })
  label!: string;
}

class OuterArrayMsgDto {
  @Field({ type: () => [InnerArrayMsgDto] })
  items!: InnerArrayMsgDto[];
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
    const result = await deserialize(StringMessageDto, { name: 42 });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]!.message).toBe('Name is invalid');
    }
  });

  it('minLength failure also includes message', async () => {
    const result = await deserialize(StringMessageDto, { name: 'ab' });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      const minLenErr = result.errors.find(e => e.code === 'minLength');
      expect(minLenErr).toBeDefined();
      expect(minLenErr!.message).toBe('Name is invalid');
    }
  });
});

describe('@Field message option — function', () => {
  it('validation failure calls function for dynamic message', async () => {
    const result = await deserialize(FunctionMessageDto, { email: 123 });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]!.message).toBe('email got bad value: 123');
    }
  });
});

describe('@Field context option', () => {
  it('validation failure includes value in BakerError.context', async () => {
    const result = await deserialize(ContextDto, { tag: 999 });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]!.context).toEqual({ severity: 'warning', field: 'tag' });
    }
  });
});

describe('@Field message + context used together', () => {
  it('both message and context included in error', async () => {
    const result = await deserialize(MessageAndContextDto, { count: 'not a number' });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]!.message).toBe('Must be a number');
      expect(result.errors[0]!.context).toEqual({ hint: 'use integer' });
    }
  });
});

describe('@Field message — applied to all rules uniformly', () => {
  it('same message applied to all rule failures for the field', async () => {
    const result = await deserialize(MultiRuleMessageDto, { username: 42 });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      for (const error of result.errors) {
        expect(error.message).toBe('Username invalid');
      }
    }
  });
});

describe('@Field message — used with arrayOf', () => {
  it('message applied to each rule failures', async () => {
    const result = await deserialize(ArrayOfMessageDto, { tags: ['valid', '', 42] });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors.length).toBeGreaterThan(0);
      for (const error of result.errors) {
        expect(error.message).toBe('Each tag must be a non-empty string');
      }
    }
  });
});

describe('@Field message not set', () => {
  it('error object does not have message property', async () => {
    const result = await deserialize(NoMessageDto, { name: 42 });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect('message' in result.errors[0]!).toBe(false);
    }
  });

  it('error object does not have context property', async () => {
    const result = await deserialize(NoMessageDto, { name: 42 });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect('context' in result.errors[0]!).toBe(false);
    }
  });
});

describe('@Field context — falsy value handling', () => {
  it('context: 0 → 0 included in error', async () => {
    const result = await deserialize(FalsyContextZeroDto, { value: 42 });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors[0]!.context).toBe(0);
    }
  });

  it('context: false → false included in error', async () => {
    const result = await deserialize(FalsyContextFalseDto, { value: 42 });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors[0]!.context).toBe(false);
    }
  });

  it('context: "" → empty string included in error', async () => {
    const result = await deserialize(FalsyContextEmptyStringDto, { value: 42 });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors[0]!.context).toBe('');
    }
  });
});

describe('@Field message — empty string', () => {
  it('message: "" → empty string included in error', async () => {
    const result = await deserialize(EmptyStringMessageDto, { value: 42 });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors[0]!.message).toBe('');
    }
  });
});

describe('@Field message function — constraints access', () => {
  it('reads rule parameters from constraints object', async () => {
    const result = await deserialize(ConstraintsAccessDto, { name: 'ab' });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]!.message).toContain('5');
    }
  });
});

describe('nested DTO error — message propagation', () => {
  it('should preserve message from nested DTO validation errors', async () => {
    const result = await deserialize(OuterMsgDto, { child: { name: 42 } });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      const childErr = result.errors.find(e => e.path.startsWith('child.'));
      expect(childErr).toBeDefined();
      expect(childErr!.message).toBe('inner msg');
    }
  });
});

describe('nested DTO error — context propagation', () => {
  it('should preserve message and context from nested DTO validation errors', async () => {
    const result = await deserialize(OuterCtxDto, { nested: { age: 'not a number' } });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      const nestedErr = result.errors.find(e => e.path.startsWith('nested.'));
      expect(nestedErr).toBeDefined();
      expect(nestedErr!.message).toBe('must be number');
      expect(nestedErr!.context).toEqual({ severity: 'error' });
    }
  });
});

describe('nested DTO array error — message propagation', () => {
  it('should preserve message from nested array DTO validation errors', async () => {
    const result = await deserialize(OuterArrayMsgDto, { items: [{ label: 42 }] });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      const itemErr = result.errors.find(e => e.path.startsWith('items['));
      expect(itemErr).toBeDefined();
      expect(itemErr!.message).toBe('item msg');
    }
  });
});

describe('@Field message + groups combination', () => {
  it('groups match → message included', async () => {
    const result = await deserialize(GroupsWithMessageDto, { secret: 42, id: 1 }, { groups: ['admin'] });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      const secretErr = result.errors.find(e => e.path === 'secret');
      expect(secretErr).toBeDefined();
      expect(secretErr!.message).toBe('Admin field invalid');
    }
  });

  it('groups mismatch → field itself excluded → no error', async () => {
    const result = await deserialize(GroupsWithMessageDto, { secret: 42, id: 1 }, { groups: ['viewer'] }) as GroupsWithMessageDto;
    expect((result as any).secret).toBeUndefined();
    expect(result.id).toBe(1);
  });
});
