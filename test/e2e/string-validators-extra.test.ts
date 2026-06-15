import { describe, it, expect, beforeEach } from 'bun:test';

import { Baker, isBakerIssueSet, Field } from '../../index';
import {
  isString,
  notContains,
  isLowercase,
  isUppercase,
  isBooleanString,
  isJSON,
  arrayNotContains,
  isArray,
} from '../../src/rules/index';

const baker = new Baker();

beforeEach(() => baker.seal());
// ─────────────────────────────────────────────────────────────────────────────

@baker.Recipe
class NotContainsDto {
  @Field(isString, notContains('bad')) val!: string;
}
@baker.Recipe
class LowercaseDto {
  @Field(isLowercase) val!: string;
}
@baker.Recipe
class UppercaseDto {
  @Field(isUppercase) val!: string;
}
@baker.Recipe
class BoolStringDto {
  @Field(isBooleanString) val!: string;
}
@baker.Recipe
class JsonDto {
  @Field(isJSON) val!: string;
}
@baker.Recipe
class ArrNotContainsDto {
  @Field(isArray, arrayNotContains([99])) items!: number[];
}

// ─────────────────────────────────────────────────────────────────────────────

describe('notContains', () => {
  it('string without substring passes', async () => {
    const r = (await baker.deserialize(NotContainsDto, { val: 'good text' })) as NotContainsDto;
    expect(r.val).toBe('good text');
  });
  it('string containing substring rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(NotContainsDto, { val: 'bad word' }))).toBe(true);
  });
});

describe('isLowercase / isUppercase', () => {
  it('lowercase passes', async () => {
    const r = (await baker.deserialize(LowercaseDto, { val: 'hello' })) as LowercaseDto;
    expect(r.val).toBe('hello');
  });
  it('contains uppercase rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(LowercaseDto, { val: 'Hello' }))).toBe(true);
  });
  it('uppercase passes', async () => {
    const r = (await baker.deserialize(UppercaseDto, { val: 'HELLO' })) as UppercaseDto;
    expect(r.val).toBe('HELLO');
  });
  it('contains lowercase rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(UppercaseDto, { val: 'Hello' }))).toBe(true);
  });
});

describe('isBooleanString', () => {
  it('"true" passes', async () => {
    const r = (await baker.deserialize(BoolStringDto, { val: 'true' })) as BoolStringDto;
    expect(r.val).toBe('true');
  });
  it('"false" passes', async () => {
    const r = (await baker.deserialize(BoolStringDto, { val: 'false' })) as BoolStringDto;
    expect(r.val).toBe('false');
  });
  it('other string rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(BoolStringDto, { val: 'yes' }))).toBe(true);
  });
});

describe('isJSON', () => {
  it('valid JSON passes', async () => {
    const r = (await baker.deserialize(JsonDto, { val: '{"a":1}' })) as JsonDto;
    expect(r.val).toBe('{"a":1}');
  });
  it('invalid JSON rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(JsonDto, { val: '{bad}' }))).toBe(true);
  });
});

describe('arrayNotContains', () => {
  it('without forbidden elements passes', async () => {
    const r = (await baker.deserialize(ArrNotContainsDto, { items: [1, 2, 3] })) as ArrNotContainsDto;
    expect(r.items).toEqual([1, 2, 3]);
  });
  it('containing forbidden elements rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(ArrNotContainsDto, { items: [1, 99, 3] }))).toBe(true);
  });
});
