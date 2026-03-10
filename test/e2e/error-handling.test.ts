import { describe, it, expect, afterEach } from 'bun:test';
import { Field, deserialize, configure, BakerValidationError } from '../../index';
import { isString, isNumber, isEmail } from '../../src/rules/index';
import { collectValidation } from '../../src/collect';
import type { BakerError } from '../../index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => { unseal(); configure({}); });

// ─────────────────────────────────────────────────────────────────────────────

class MultiDto {
  @Field(isString)
  a!: string;

  @Field(isString)
  b!: string;

  @Field(isString)
  c!: string;
}

class MessageDto {
  @Field()
  name!: string;
}
// Attach isString rule with custom message via collectValidation
collectValidation(MessageDto.prototype, 'name', {
  rule: isString,
  message: 'name은 문자열이어야 합니다',
});

class MessageFnDto {
  @Field()
  score!: number;
}
collectValidation(MessageFnDto.prototype, 'score', {
  rule: isNumber(),
  message: ({ property, value }) => `${property}(${value})은 숫자가 아닙니다`,
});

class ContextDto {
  @Field()
  email!: string;
}
collectValidation(ContextDto.prototype, 'email', {
  rule: isEmail(),
  context: { severity: 'critical' },
});

class ClassNameDto {
  @Field(isString)
  field!: string;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('error handling — stopAtFirstError', () => {
  it('stopAtFirstError: true → 에러 1개', async () => {
    configure({ stopAtFirstError: true });
    try {
      await deserialize(MultiDto, { a: 1, b: 2, c: 3 });
      expect.unreachable();
    } catch (e) {
      expect((e as BakerValidationError).errors.length).toBe(1);
    }
  });

  it('stopAtFirstError: false (기본) → 전체 에러 수집', async () => {
    try {
      await deserialize(MultiDto, { a: 1, b: 2, c: 3 });
      expect.unreachable();
    } catch (e) {
      expect((e as BakerValidationError).errors.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('error handling — custom message', () => {
  it('string message', async () => {
    try {
      await deserialize(MessageDto, { name: 123 });
      expect.unreachable();
    } catch (e) {
      const err = (e as BakerValidationError).errors.find(e => e.path === 'name');
      expect(err!.message).toBe('name은 문자열이어야 합니다');
    }
  });

  it('function message', async () => {
    try {
      await deserialize(MessageFnDto, { score: 'abc' });
      expect.unreachable();
    } catch (e) {
      const err = (e as BakerValidationError).errors.find(e => e.path === 'score');
      expect(err!.message).toContain('score');
      expect(err!.message).toContain('abc');
    }
  });
});

describe('error handling — context', () => {
  it('context 객체 포함', async () => {
    try {
      await deserialize(ContextDto, { email: 'not-email' });
      expect.unreachable();
    } catch (e) {
      const err = (e as BakerValidationError).errors.find(e => e.path === 'email');
      expect(err!.context).toEqual({ severity: 'critical' });
    }
  });
});

describe('error handling — className', () => {
  it('BakerValidationError.className 포함', async () => {
    try {
      await deserialize(ClassNameDto, { field: 42 });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BakerValidationError);
      expect((e as BakerValidationError).className).toBe('ClassNameDto');
    }
  });

  it('error message에 클래스명 포함', async () => {
    try {
      await deserialize(ClassNameDto, { field: 42 });
      expect.unreachable();
    } catch (e) {
      expect((e as BakerValidationError).message).toContain('ClassNameDto');
    }
  });
});
