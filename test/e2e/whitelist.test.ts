import { describe, it, expect, afterEach } from 'bun:test';
import { seal, deserialize, BakerValidationError, IsString, IsNumber, Expose } from '../../index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class ProfileDto {
  @IsString()
  name!: string;

  @IsNumber()
  age!: number;
}

class ExposedDto {
  @Expose({ name: 'user_name' })
  @IsString()
  name!: string;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('whitelist seal option', () => {
  it('미선언 필드 거부', async () => {
    seal({ whitelist: true });
    try {
      await deserialize(ProfileDto, { name: 'Alice', age: 25, extra: 'bad' });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BakerValidationError);
      const err = (e as BakerValidationError).errors.find(e => e.code === 'whitelistViolation');
      expect(err).toBeDefined();
      expect(err!.path).toBe('extra');
    }
  });

  it('선언 필드만 있으면 통과', async () => {
    seal({ whitelist: true });
    const result = await deserialize<ProfileDto>(ProfileDto, { name: 'Bob', age: 30 });
    expect(result.name).toBe('Bob');
    expect(result.age).toBe(30);
  });

  it('@Expose extractKey 기준으로 허용', async () => {
    seal({ whitelist: true });
    const result = await deserialize<ExposedDto>(ExposedDto, { user_name: 'Carol' });
    expect(result.name).toBe('Carol');
  });

  it('@Expose extractKey 외 필드 거부', async () => {
    seal({ whitelist: true });
    try {
      await deserialize(ExposedDto, { user_name: 'Carol', hack: 1 });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BakerValidationError);
      expect((e as BakerValidationError).errors.some(e => e.code === 'whitelistViolation')).toBe(true);
    }
  });

  it('collectErrors 모드에서 다수 미선언 필드 수집', async () => {
    seal({ whitelist: true });
    try {
      await deserialize(ProfileDto, { name: 'X', age: 1, foo: 1, bar: 2 });
      expect.unreachable();
    } catch (e) {
      const errors = (e as BakerValidationError).errors.filter(e => e.code === 'whitelistViolation');
      expect(errors.length).toBe(2);
    }
  });

  it('stopAtFirstError + whitelist → 첫 번째 위반만', async () => {
    seal({ whitelist: true, stopAtFirstError: true });
    try {
      await deserialize(ProfileDto, { name: 'X', age: 1, foo: 1, bar: 2 });
      expect.unreachable();
    } catch (e) {
      expect((e as BakerValidationError).errors.length).toBe(1);
    }
  });

  it('whitelist + 검증 에러 동시 수집', async () => {
    seal({ whitelist: true });
    try {
      await deserialize(ProfileDto, { name: 123, age: 'bad', extra: 'x' });
      expect.unreachable();
    } catch (e) {
      const errors = (e as BakerValidationError).errors;
      // 타입 에러 + whitelist 에러 모두 수집
      expect(errors.some(x => x.code === 'isString')).toBe(true);
      expect(errors.some(x => x.code === 'isNumber')).toBe(true);
      expect(errors.some(x => x.code === 'whitelistViolation')).toBe(true);
    }
  });
});
