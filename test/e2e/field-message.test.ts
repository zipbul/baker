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
  it('검증 실패 시 BakerError.message에 문자열 포함', async () => {
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

  it('minLength 실패 시에도 message 포함', async () => {
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
  it('검증 실패 시 함수가 호출되어 동적 메시지 생성', async () => {
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
  it('검증 실패 시 BakerError.context에 값 포함', async () => {
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

describe('@Field message + context 동시 사용', () => {
  it('message와 context 모두 에러에 포함', async () => {
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

describe('@Field message — 여러 룰에 일괄 적용', () => {
  it('필드의 모든 룰 실패에 동일 message 적용', async () => {
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

describe('@Field message — arrayOf와 함께 사용', () => {
  it('each 룰 실패에도 message 적용', async () => {
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

describe('@Field message 미설정 시', () => {
  it('에러 객체에 message 프로퍼티 자체가 없음', async () => {
    try {
      await deserialize(NoMessageDto, { name: 42 });
      expect.unreachable('should have thrown');
    } catch (e) {
      const err = e as BakerValidationError;
      expect('message' in err.errors[0]!).toBe(false);
    }
  });

  it('에러 객체에 context 프로퍼티 자체가 없음', async () => {
    try {
      await deserialize(NoMessageDto, { name: 42 });
      expect.unreachable('should have thrown');
    } catch (e) {
      const err = e as BakerValidationError;
      expect('context' in err.errors[0]!).toBe(false);
    }
  });
});

describe('@Field context — falsy 값 처리', () => {
  it('context: 0 → 에러에 0 포함', async () => {
    try {
      await deserialize(FalsyContextZeroDto, { value: 42 });
      expect.unreachable('should have thrown');
    } catch (e) {
      const err = e as BakerValidationError;
      expect(err.errors[0]!.context).toBe(0);
    }
  });

  it('context: false → 에러에 false 포함', async () => {
    try {
      await deserialize(FalsyContextFalseDto, { value: 42 });
      expect.unreachable('should have thrown');
    } catch (e) {
      const err = e as BakerValidationError;
      expect(err.errors[0]!.context).toBe(false);
    }
  });

  it('context: "" → 에러에 빈 문자열 포함', async () => {
    try {
      await deserialize(FalsyContextEmptyStringDto, { value: 42 });
      expect.unreachable('should have thrown');
    } catch (e) {
      const err = e as BakerValidationError;
      expect(err.errors[0]!.context).toBe('');
    }
  });
});

describe('@Field message — 빈 문자열', () => {
  it('message: "" → 빈 문자열도 에러에 포함', async () => {
    try {
      await deserialize(EmptyStringMessageDto, { value: 42 });
      expect.unreachable('should have thrown');
    } catch (e) {
      const err = e as BakerValidationError;
      expect(err.errors[0]!.message).toBe('');
    }
  });
});

describe('@Field message function — constraints 접근', () => {
  it('constraints 객체에서 룰 파라미터 읽기', async () => {
    try {
      await deserialize(ConstraintsAccessDto, { name: 'ab' });
      expect.unreachable('should have thrown');
    } catch (e) {
      const err = e as BakerValidationError;
      expect(err.errors.length).toBeGreaterThan(0);
      // minLength(5)의 constraints에 min: 5가 있어야 한다
      expect(err.errors[0]!.message).toContain('5');
    }
  });
});

describe('@Field message + groups 조합', () => {
  it('groups 일치 시 message 포함', async () => {
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

  it('groups 불일치 시 필드 자체 제외 → 에러 없음', async () => {
    const result = await deserialize(GroupsWithMessageDto, { secret: 42, id: 1 }, { groups: ['viewer'] });
    expect((result as any).secret).toBeUndefined();
    expect(result.id).toBe(1);
  });
});
