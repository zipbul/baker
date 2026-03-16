import { describe, it, expect } from 'bun:test';
import { deserialize, BakerValidationError, Field } from '../../index';
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
    const r = await deserialize<NotContainsDto>(NotContainsDto, { val: 'good text' });
    expect(r.val).toBe('good text');
  });
  it('string containing substring rejected', async () => {
    await expect(deserialize(NotContainsDto, { val: 'bad word' })).rejects.toThrow(BakerValidationError);
  });
});

describe('isLowercase / isUppercase', () => {
  it('lowercase passes', async () => {
    const r = await deserialize<LowercaseDto>(LowercaseDto, { val: 'hello' });
    expect(r.val).toBe('hello');
  });
  it('contains uppercase rejected', async () => {
    await expect(deserialize(LowercaseDto, { val: 'Hello' })).rejects.toThrow(BakerValidationError);
  });
  it('uppercase passes', async () => {
    const r = await deserialize<UppercaseDto>(UppercaseDto, { val: 'HELLO' });
    expect(r.val).toBe('HELLO');
  });
  it('contains lowercase rejected', async () => {
    await expect(deserialize(UppercaseDto, { val: 'Hello' })).rejects.toThrow(BakerValidationError);
  });
});

describe('isBooleanString', () => {
  it('"true" passes', async () => {
    const r = await deserialize<BoolStringDto>(BoolStringDto, { val: 'true' });
    expect(r.val).toBe('true');
  });
  it('"false" passes', async () => {
    const r = await deserialize<BoolStringDto>(BoolStringDto, { val: 'false' });
    expect(r.val).toBe('false');
  });
  it('other string rejected', async () => {
    await expect(deserialize(BoolStringDto, { val: 'yes' })).rejects.toThrow(BakerValidationError);
  });
});

describe('isJSON', () => {
  it('valid JSON passes', async () => {
    const r = await deserialize<JsonDto>(JsonDto, { val: '{"a":1}' });
    expect(r.val).toBe('{"a":1}');
  });
  it('invalid JSON rejected', async () => {
    await expect(deserialize(JsonDto, { val: '{bad}' })).rejects.toThrow(BakerValidationError);
  });
});

describe('arrayNotContains', () => {
  it('without forbidden elements passes', async () => {
    const r = await deserialize<ArrNotContainsDto>(ArrNotContainsDto, { items: [1, 2, 3] });
    expect(r.items).toEqual([1, 2, 3]);
  });
  it('containing forbidden elements rejected', async () => {
    await expect(deserialize(ArrNotContainsDto, { items: [1, 99, 3] })).rejects.toThrow(BakerValidationError);
  });
});
