import { describe, it, expect, afterEach } from 'bun:test';
import { deserialize, configure, BakerValidationError, Field } from '../../index';
import { isString, isNumber } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

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

describe('forbidUnknown (whitelist) configure option', () => {
  it('미선언 필드 거부', async () => {
    configure({ forbidUnknown: true });
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
    configure({ forbidUnknown: true });
    const result = await deserialize<ProfileDto>(ProfileDto, { name: 'Bob', age: 30 });
    expect(result.name).toBe('Bob');
    expect(result.age).toBe(30);
  });

  it('@Field({ name }) extractKey 기준으로 허용', async () => {
    configure({ forbidUnknown: true });
    const result = await deserialize<ExposedDto>(ExposedDto, { user_name: 'Carol' });
    expect(result.name).toBe('Carol');
  });

  it('@Field({ name }) extractKey 외 필드 거부', async () => {
    configure({ forbidUnknown: true });
    try {
      await deserialize(ExposedDto, { user_name: 'Carol', hack: 1 });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BakerValidationError);
      expect((e as BakerValidationError).errors.some(e => e.code === 'whitelistViolation')).toBe(true);
    }
  });

  it('collectErrors 모드에서 다수 미선언 필드 수집', async () => {
    configure({ forbidUnknown: true });
    try {
      await deserialize(ProfileDto, { name: 'X', age: 1, foo: 1, bar: 2 });
      expect.unreachable();
    } catch (e) {
      const errors = (e as BakerValidationError).errors.filter(e => e.code === 'whitelistViolation');
      expect(errors.length).toBe(2);
    }
  });

  it('stopAtFirstError + forbidUnknown → 첫 번째 위반만', async () => {
    configure({ forbidUnknown: true, stopAtFirstError: true });
    try {
      await deserialize(ProfileDto, { name: 'X', age: 1, foo: 1, bar: 2 });
      expect.unreachable();
    } catch (e) {
      expect((e as BakerValidationError).errors.length).toBe(1);
    }
  });

  it('forbidUnknown + 검증 에러 동시 수집', async () => {
    configure({ forbidUnknown: true });
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

// ─── E-18: stripUnknown deprecated alias → forbidUnknown 동작 ───────────

describe('E-18: stripUnknown deprecated alias', () => {
  it('stripUnknown: true → forbidUnknown과 동일하게 unknown 필드 거부', async () => {
    configure({ stripUnknown: true });
    try {
      await deserialize(ProfileDto, { name: 'Alice', age: 25, extra: 'bad' });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BakerValidationError);
      const err = (e as BakerValidationError).errors.find(e => e.code === 'whitelistViolation');
      expect(err).toBeDefined();
    }
  });

  it('forbidUnknown이 명시되면 stripUnknown 무시 (forbidUnknown: false 우선)', async () => {
    configure({ forbidUnknown: false, stripUnknown: true });
    // forbidUnknown: false overrides stripUnknown: true
    const result = await deserialize<ProfileDto>(ProfileDto, { name: 'Bob', age: 30, extra: 'ok' });
    expect(result.name).toBe('Bob');
  });

  it('stripUnknown: true + 선언 필드만 → 통과', async () => {
    configure({ stripUnknown: true });
    const result = await deserialize<ProfileDto>(ProfileDto, { name: 'Carol', age: 40 });
    expect(result.name).toBe('Carol');
    expect(result.age).toBe(40);
  });
});
