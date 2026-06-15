import { describe, it, expect } from 'bun:test';

import { Baker, Field } from '../../index';
import { isString, isNumber } from '../../src/rules/index';
import { assertBakerIssueSet } from '../integration/helpers/assert';

// ─────────────────────────────────────────────────────────────────────────────

describe('forbidUnknown (whitelist) configure option', () => {
  it('undeclared field rejected', async () => {
    const b = new Baker({ forbidUnknown: true });
    @b.Recipe
    class ProfileDto {
      @Field(isString) name!: string;
      @Field(isNumber()) age!: number;
    }
    b.seal();
    const result = await b.deserialize(ProfileDto, { name: 'Alice', age: 25, extra: 'bad' });
    assertBakerIssueSet(result);
    const err = result.errors.find(e => e.code === 'whitelistViolation');
    expect(err).toBeDefined();
    expect(err!.path).toBe('extra');
  });

  it('only declared fields → passes', async () => {
    const b = new Baker({ forbidUnknown: true });
    @b.Recipe
    class ProfileDto {
      @Field(isString) name!: string;
      @Field(isNumber()) age!: number;
    }
    b.seal();
    const result = (await b.deserialize(ProfileDto, { name: 'Bob', age: 30 })) as ProfileDto;
    expect(result.name).toBe('Bob');
    expect(result.age).toBe(30);
  });

  it('@Field({ name }) extractKey allowed', async () => {
    const b = new Baker({ forbidUnknown: true });
    @b.Recipe
    class ExposedDto {
      @Field(isString, { name: 'user_name' }) name!: string;
    }
    b.seal();
    const result = (await b.deserialize(ExposedDto, { user_name: 'Carol' })) as ExposedDto;
    expect(result.name).toBe('Carol');
  });

  it('fields outside @Field({ name }) extractKey rejected', async () => {
    const b = new Baker({ forbidUnknown: true });
    @b.Recipe
    class ExposedDto {
      @Field(isString, { name: 'user_name' }) name!: string;
    }
    b.seal();
    const result = await b.deserialize(ExposedDto, { user_name: 'Carol', hack: 1 });
    assertBakerIssueSet(result);
    expect(result.errors.some(e => e.code === 'whitelistViolation')).toBe(true);
  });

  it('collectErrors mode collects multiple undeclared fields', async () => {
    const b = new Baker({ forbidUnknown: true });
    @b.Recipe
    class ProfileDto {
      @Field(isString) name!: string;
      @Field(isNumber()) age!: number;
    }
    b.seal();
    const result = await b.deserialize(ProfileDto, { name: 'X', age: 1, foo: 1, bar: 2 });
    assertBakerIssueSet(result);
    const errors = result.errors.filter(e => e.code === 'whitelistViolation');
    expect(errors.length).toBe(2);
  });

  it('stopAtFirstError + forbidUnknown → first violation only', async () => {
    const b = new Baker({ forbidUnknown: true, stopAtFirstError: true });
    @b.Recipe
    class ProfileDto {
      @Field(isString) name!: string;
      @Field(isNumber()) age!: number;
    }
    b.seal();
    const result = await b.deserialize(ProfileDto, { name: 'X', age: 1, foo: 1, bar: 2 });
    assertBakerIssueSet(result);
    expect(result.errors.length).toBe(1);
  });

  it('forbidUnknown + validation errors collected together', async () => {
    const b = new Baker({ forbidUnknown: true });
    @b.Recipe
    class ProfileDto {
      @Field(isString) name!: string;
      @Field(isNumber()) age!: number;
    }
    b.seal();
    const result = await b.deserialize(ProfileDto, { name: 123, age: 'bad', extra: 'x' });
    assertBakerIssueSet(result);
    const errors = result.errors;
    expect(errors.some(x => x.code === 'isString')).toBe(true);
    expect(errors.some(x => x.code === 'isNumber')).toBe(true);
    expect(errors.some(x => x.code === 'whitelistViolation')).toBe(true);
  });
});
