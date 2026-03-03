import { describe, it, expect, afterEach } from 'bun:test';
import { seal, deserialize, BakerValidationError, IsString, IsNumber, IsEmail, Min } from '../../index';
import type { BakerError } from '../../index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class MultiDto {
  @IsString()
  a!: string;

  @IsString()
  b!: string;

  @IsString()
  c!: string;
}

class MessageDto {
  @IsString({ message: 'name은 문자열이어야 합니다' })
  name!: string;
}

class MessageFnDto {
  @IsNumber(undefined, { message: ({ property, value }) => `${property}(${value})은 숫자가 아닙니다` })
  score!: number;
}

class ContextDto {
  @IsEmail(undefined, { context: { severity: 'critical' } })
  email!: string;
}

class ClassNameDto {
  @IsString()
  field!: string;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('error handling — stopAtFirstError', () => {
  it('stopAtFirstError: true → 에러 1개', async () => {
    seal({ stopAtFirstError: true });
    try {
      await deserialize(MultiDto, { a: 1, b: 2, c: 3 });
      expect.unreachable();
    } catch (e) {
      expect((e as BakerValidationError).errors.length).toBe(1);
    }
  });

  it('stopAtFirstError: false (기본) → 전체 에러 수집', async () => {
    seal();
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
    seal();
    try {
      await deserialize(MessageDto, { name: 123 });
      expect.unreachable();
    } catch (e) {
      const err = (e as BakerValidationError).errors.find(e => e.path === 'name');
      expect(err!.message).toBe('name은 문자열이어야 합니다');
    }
  });

  it('function message', async () => {
    seal();
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
    seal();
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
    seal();
    try {
      await deserialize(ClassNameDto, { field: 42 });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BakerValidationError);
      expect((e as BakerValidationError).className).toBe('ClassNameDto');
    }
  });

  it('error message에 클래스명 포함', async () => {
    seal();
    try {
      await deserialize(ClassNameDto, { field: 42 });
      expect.unreachable();
    } catch (e) {
      expect((e as BakerValidationError).message).toContain('ClassNameDto');
    }
  });
});
