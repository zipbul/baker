import { describe, it, expect, afterEach } from 'bun:test';
import { deserialize, configure, isBakerError, Field } from '../../index';
import type { BakerErrors } from '../../index';
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
    const result = await deserialize(ProfileDto, { name: 'Alice', age: 25, extra: 'bad' });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      const err = result.errors.find(e => e.code === 'whitelistViolation');
      expect(err).toBeDefined();
      expect(err!.path).toBe('extra');
    }
  });

  it('only declared fields → passes', async () => {
    configure({ forbidUnknown: true });
    const result = await deserialize(ProfileDto, { name: 'Bob', age: 30 }) as ProfileDto;
    expect(result.name).toBe('Bob');
    expect(result.age).toBe(30);
  });

  it('@Field({ name }) extractKey allowed', async () => {
    configure({ forbidUnknown: true });
    const result = await deserialize(ExposedDto, { user_name: 'Carol' }) as ExposedDto;
    expect(result.name).toBe('Carol');
  });

  it('fields outside @Field({ name }) extractKey rejected', async () => {
    configure({ forbidUnknown: true });
    const result = await deserialize(ExposedDto, { user_name: 'Carol', hack: 1 });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors.some(e => e.code === 'whitelistViolation')).toBe(true);
    }
  });

  it('collectErrors mode collects multiple undeclared fields', async () => {
    configure({ forbidUnknown: true });
    const result = await deserialize(ProfileDto, { name: 'X', age: 1, foo: 1, bar: 2 });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      const errors = result.errors.filter(e => e.code === 'whitelistViolation');
      expect(errors.length).toBe(2);
    }
  });

  it('stopAtFirstError + forbidUnknown → first violation only', async () => {
    configure({ forbidUnknown: true, stopAtFirstError: true });
    const result = await deserialize(ProfileDto, { name: 'X', age: 1, foo: 1, bar: 2 });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors.length).toBe(1);
    }
  });

  it('forbidUnknown + validation errors collected together', async () => {
    configure({ forbidUnknown: true });
    const result = await deserialize(ProfileDto, { name: 123, age: 'bad', extra: 'x' });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      const errors = result.errors;
      expect(errors.some(x => x.code === 'isString')).toBe(true);
      expect(errors.some(x => x.code === 'isNumber')).toBe(true);
      expect(errors.some(x => x.code === 'whitelistViolation')).toBe(true);
    }
  });
});
