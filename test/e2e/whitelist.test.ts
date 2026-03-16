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
  it('undeclared field rejected', async () => {
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

  it('only declared fields → passes', async () => {
    configure({ forbidUnknown: true });
    const result = await deserialize<ProfileDto>(ProfileDto, { name: 'Bob', age: 30 });
    expect(result.name).toBe('Bob');
    expect(result.age).toBe(30);
  });

  it('@Field({ name }) extractKey allowed', async () => {
    configure({ forbidUnknown: true });
    const result = await deserialize<ExposedDto>(ExposedDto, { user_name: 'Carol' });
    expect(result.name).toBe('Carol');
  });

  it('fields outside @Field({ name }) extractKey rejected', async () => {
    configure({ forbidUnknown: true });
    try {
      await deserialize(ExposedDto, { user_name: 'Carol', hack: 1 });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BakerValidationError);
      expect((e as BakerValidationError).errors.some(e => e.code === 'whitelistViolation')).toBe(true);
    }
  });

  it('collectErrors mode collects multiple undeclared fields', async () => {
    configure({ forbidUnknown: true });
    try {
      await deserialize(ProfileDto, { name: 'X', age: 1, foo: 1, bar: 2 });
      expect.unreachable();
    } catch (e) {
      const errors = (e as BakerValidationError).errors.filter(e => e.code === 'whitelistViolation');
      expect(errors.length).toBe(2);
    }
  });

  it('stopAtFirstError + forbidUnknown → first violation only', async () => {
    configure({ forbidUnknown: true, stopAtFirstError: true });
    try {
      await deserialize(ProfileDto, { name: 'X', age: 1, foo: 1, bar: 2 });
      expect.unreachable();
    } catch (e) {
      expect((e as BakerValidationError).errors.length).toBe(1);
    }
  });

  it('forbidUnknown + validation errors collected together', async () => {
    configure({ forbidUnknown: true });
    try {
      await deserialize(ProfileDto, { name: 123, age: 'bad', extra: 'x' });
      expect.unreachable();
    } catch (e) {
      const errors = (e as BakerValidationError).errors;
      // type errors + whitelist errors all collected
      expect(errors.some(x => x.code === 'isString')).toBe(true);
      expect(errors.some(x => x.code === 'isNumber')).toBe(true);
      expect(errors.some(x => x.code === 'whitelistViolation')).toBe(true);
    }
  });
});

// ─── E-18: stripUnknown deprecated alias → forbidUnknown behavior ─────────

describe('E-18: stripUnknown deprecated alias', () => {
  it('stripUnknown: true → rejects unknown fields same as forbidUnknown', async () => {
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

  it('forbidUnknown explicit overrides stripUnknown (forbidUnknown: false takes priority)', async () => {
    configure({ forbidUnknown: false, stripUnknown: true });
    // forbidUnknown: false overrides stripUnknown: true
    const result = await deserialize<ProfileDto>(ProfileDto, { name: 'Bob', age: 30, extra: 'ok' });
    expect(result.name).toBe('Bob');
  });

  it('stripUnknown: true + only declared fields → passes', async () => {
    configure({ stripUnknown: true });
    const result = await deserialize<ProfileDto>(ProfileDto, { name: 'Carol', age: 40 });
    expect(result.name).toBe('Carol');
    expect(result.age).toBe(40);
  });
});
