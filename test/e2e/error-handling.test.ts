import { describe, it, expect } from 'bun:test';

import { Baker, Field, deserialize, isBakerIssueSet } from '../../index';
import { isString, isNumber, isEmail } from '../../src/rules/index';
import { assertBakerIssueSet } from '../integration/helpers/assert';

const baker = new Baker();

@baker.Recipe
class MultiDto {
  @Field(isString) a!: string;
  @Field(isString) b!: string;
  @Field(isString) c!: string;
}

@baker.Recipe
class MessageDto {
  @Field(isString, { message: 'name must be a string' }) name!: string;
}

@baker.Recipe
class MessageFnDto {
  @Field(isNumber(), { message: ({ property, value }) => `${property}(${value}) is not a number` }) score!: number;
}

@baker.Recipe
class ContextDto {
  @Field(isEmail(), { context: { severity: 'critical' } }) email!: string;
}

@baker.Recipe
class ClassNameDto {
  @Field(isString) field!: string;
}

baker.seal();

describe('error handling — stopAtFirstError', () => {
  it('stopAtFirstError: true → only 1 error', async () => {
    const b = new Baker({ stopAtFirstError: true });
    @b.Recipe
    class MultiStopDto {
      @Field(isString) a!: string;
      @Field(isString) b!: string;
      @Field(isString) c!: string;
    }
    b.seal();
    const result = await deserialize(MultiStopDto, { a: 1, b: 2, c: 3 });
    assertBakerIssueSet(result);
    expect(result.errors.length).toBe(1);
  });

  it('stopAtFirstError: false (default) → collects all errors', async () => {
    const result = await deserialize(MultiDto, { a: 1, b: 2, c: 3 });
    assertBakerIssueSet(result);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe('error handling — custom message', () => {
  it('string message', async () => {
    const result = await deserialize(MessageDto, { name: 123 });
    assertBakerIssueSet(result);
    const err = result.errors.find(e => e.path === 'name');
    expect(err!.message).toBe('name must be a string');
  });

  it('function message', async () => {
    const result = await deserialize(MessageFnDto, { score: 'abc' });
    assertBakerIssueSet(result);
    const err = result.errors.find(e => e.path === 'score');
    expect(err!.message).toContain('score');
    expect(err!.message).toContain('abc');
  });
});

describe('error handling — context', () => {
  it('includes context object', async () => {
    const result = await deserialize(ContextDto, { email: 'not-email' });
    assertBakerIssueSet(result);
    const err = result.errors.find(e => e.path === 'email');
    expect(err!.context).toEqual({ severity: 'critical' });
  });
});

describe('error handling — className', () => {
  it('validation fails for ClassNameDto', async () => {
    const result = await deserialize(ClassNameDto, { field: 42 });
    expect(isBakerIssueSet(result)).toBe(true);
  });
});
