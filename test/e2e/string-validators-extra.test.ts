import { describe, it, expect } from 'bun:test';
import { deserialize, isBakerError, Field } from '../../index';
import {
  isString, notContains, isLowercase, isUppercase, isBooleanString, isJSON,
  arrayNotContains, isArray,
} from '../../src/rules/index';
// ─────────────────────────────────────────────────────────────────────────────

class NotContainsDto { @Field(isString, notContains('bad')) val!: string; }
class LowercaseDto { @Field(isLowercase) val!: string; }
class UppercaseDto { @Field(isUppercase) val!: string; }
class BoolStringDto { @Field(isBooleanString) val!: string; }
class JsonDto { @Field(isJSON) val!: string; }
class ArrNotContainsDto { @Field(isArray, arrayNotContains([99])) items!: number[]; }

// ─────────────────────────────────────────────────────────────────────────────

describe('notContains', () => {
  it('string without substring passes', async () => {
    const r = await deserialize(NotContainsDto, { val: 'good text' }) as NotContainsDto;
    expect(r.val).toBe('good text');
  });
  it('string containing substring rejected', async () => {
    expect(isBakerError(await deserialize(NotContainsDto, { val: 'bad word' }))).toBe(true);
  });
});

describe('isLowercase / isUppercase', () => {
  it('lowercase passes', async () => {
    const r = await deserialize(LowercaseDto, { val: 'hello' }) as LowercaseDto;
    expect(r.val).toBe('hello');
  });
  it('contains uppercase rejected', async () => {
    expect(isBakerError(await deserialize(LowercaseDto, { val: 'Hello' }))).toBe(true);
  });
  it('uppercase passes', async () => {
    const r = await deserialize(UppercaseDto, { val: 'HELLO' }) as UppercaseDto;
    expect(r.val).toBe('HELLO');
  });
  it('contains lowercase rejected', async () => {
    expect(isBakerError(await deserialize(UppercaseDto, { val: 'Hello' }))).toBe(true);
  });
});

describe('isBooleanString', () => {
  it('"true" passes', async () => {
    const r = await deserialize(BoolStringDto, { val: 'true' }) as BoolStringDto;
    expect(r.val).toBe('true');
  });
  it('"false" passes', async () => {
    const r = await deserialize(BoolStringDto, { val: 'false' }) as BoolStringDto;
    expect(r.val).toBe('false');
  });
  it('other string rejected', async () => {
    expect(isBakerError(await deserialize(BoolStringDto, { val: 'yes' }))).toBe(true);
  });
});

describe('isJSON', () => {
  it('valid JSON passes', async () => {
    const r = await deserialize(JsonDto, { val: '{"a":1}' }) as JsonDto;
    expect(r.val).toBe('{"a":1}');
  });
  it('invalid JSON rejected', async () => {
    expect(isBakerError(await deserialize(JsonDto, { val: '{bad}' }))).toBe(true);
  });
});

describe('arrayNotContains', () => {
  it('without forbidden elements passes', async () => {
    const r = await deserialize(ArrNotContainsDto, { items: [1, 2, 3] }) as ArrNotContainsDto;
    expect(r.items).toEqual([1, 2, 3]);
  });
  it('containing forbidden elements rejected', async () => {
    expect(isBakerError(await deserialize(ArrNotContainsDto, { items: [1, 99, 3] }))).toBe(true);
  });
});
