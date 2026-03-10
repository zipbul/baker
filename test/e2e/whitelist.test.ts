import { describe, it, expect, afterEach } from 'bun:test';
import { deserialize, configure, BakerValidationError, Field } from '../../index';
import { isString, isNumber } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => { unseal(); configure({}); });

// ─────────────────────────────────────────────────────────────────────────────

class ProfileDto {
  @Field(isString)
  name!: string;

  @Field(isNumber())
  age!: number;
}

class ExposedDto {
  @Field(isString, { name: 'user_name' })
  name!: string;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('stripUnknown (whitelist) configure option', () => {
  it('미선언 필드 거부', async () => {
    configure({ stripUnknown: true });
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
    configure({ stripUnknown: true });
    const result = await deserialize<ProfileDto>(ProfileDto, { name: 'Bob', age: 30 });
    expect(result.name).toBe('Bob');
    expect(result.age).toBe(30);
  });

  it('@Field({ name }) extractKey 기준으로 허용', async () => {
    configure({ stripUnknown: true });
    const result = await deserialize<ExposedDto>(ExposedDto, { user_name: 'Carol' });
    expect(result.name).toBe('Carol');
  });

  it('@Field({ name }) extractKey 외 필드 거부', async () => {
    configure({ stripUnknown: true });
    try {
      await deserialize(ExposedDto, { user_name: 'Carol', hack: 1 });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BakerValidationError);
      expect((e as BakerValidationError).errors.some(e => e.code === 'whitelistViolation')).toBe(true);
    }
  });

  it('collectErrors 모드에서 다수 미선언 필드 수집', async () => {
    configure({ stripUnknown: true });
    try {
      await deserialize(ProfileDto, { name: 'X', age: 1, foo: 1, bar: 2 });
      expect.unreachable();
    } catch (e) {
      const errors = (e as BakerValidationError).errors.filter(e => e.code === 'whitelistViolation');
      expect(errors.length).toBe(2);
    }
  });

  it('stopAtFirstError + stripUnknown → 첫 번째 위반만', async () => {
    configure({ stripUnknown: true, stopAtFirstError: true });
    try {
      await deserialize(ProfileDto, { name: 'X', age: 1, foo: 1, bar: 2 });
      expect.unreachable();
    } catch (e) {
      expect((e as BakerValidationError).errors.length).toBe(1);
    }
  });

  it('stripUnknown + 검증 에러 동시 수집', async () => {
    configure({ stripUnknown: true });
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
