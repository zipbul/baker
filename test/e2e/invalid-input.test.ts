import { describe, it, expect, afterEach } from 'bun:test';
import { seal, deserialize, BakerValidationError, IsString } from '../../index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class SimpleDto {
  @IsString()
  name!: string;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('invalidInput 에러 코드', () => {
  it('null 입력 → invalidInput', async () => {
    seal();
    try {
      await deserialize(SimpleDto, null);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BakerValidationError);
      const err = (e as BakerValidationError).errors[0];
      expect(err.path).toBe('');
      expect(err.code).toBe('invalidInput');
    }
  });

  it('undefined 입력 → invalidInput', async () => {
    seal();
    try {
      await deserialize(SimpleDto, undefined);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BakerValidationError);
      expect((e as BakerValidationError).errors[0].code).toBe('invalidInput');
    }
  });

  it('배열 입력 → invalidInput', async () => {
    seal();
    try {
      await deserialize(SimpleDto, [1, 2, 3]);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BakerValidationError);
      expect((e as BakerValidationError).errors[0].code).toBe('invalidInput');
    }
  });

  it('문자열 입력 → invalidInput', async () => {
    seal();
    try {
      await deserialize(SimpleDto, 'hello');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BakerValidationError);
      expect((e as BakerValidationError).errors[0].code).toBe('invalidInput');
    }
  });

  it('숫자 입력 → invalidInput', async () => {
    seal();
    try {
      await deserialize(SimpleDto, 42);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BakerValidationError);
      expect((e as BakerValidationError).errors[0].code).toBe('invalidInput');
    }
  });

  it('유효한 객체 → 통과', async () => {
    seal();
    const result = await deserialize<SimpleDto>(SimpleDto, { name: 'Alice' });
    expect(result.name).toBe('Alice');
  });
});
