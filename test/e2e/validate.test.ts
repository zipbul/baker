import { describe, it, expect, beforeEach, afterEach } from 'bun:test';

import { Baker, isBakerIssueSet, Field } from '../../index';
import { isString, isNumber, isEmail, min, max, minLength } from '../../src/rules/index';
import { assertBakerIssueSet } from '../integration/helpers/assert';
import { sealClass } from '../integration/helpers/seal';
import { unseal } from '../integration/helpers/unseal';

const baker = new Baker();

beforeEach(() => baker.seal());
afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────
// DTO-level validation
// ─────────────────────────────────────────────────────────────────────────────

@baker.Recipe
class SimpleDto {
  @Field(isString, minLength(2)) name!: string;
  @Field(isNumber(), min(0), max(150)) age!: number;
  @Field(isString, isEmail()) email!: string;
}

@baker.Recipe
class NestedAddressDto {
  @Field(isString, minLength(1)) city!: string;
}

@baker.Recipe
class NestedUserDto {
  @Field(isString) name!: string;
  @Field({ type: () => NestedAddressDto }) address!: NestedAddressDto;
}

describe('validate DTO — basic', () => {
  it('valid input → true', async () => {
    expect(await baker.validate(SimpleDto, { name: 'Alice', age: 30, email: 'a@b.com' })).toBe(true);
  });

  it('invalid input → BakerIssueSet with field paths', async () => {
    const result = await baker.validate(SimpleDto, { name: 'A', age: -5, email: 'bad' });
    assertBakerIssueSet(result);
    const codes = result.errors.map(e => e.code);
    expect(codes).toContain('minLength');
    expect(codes).toContain('min');
    expect(codes).toContain('isEmail');
  });

  it('wrong types → BakerIssueSet', async () => {
    const result = await baker.validate(SimpleDto, { name: 123, age: 'bad', email: 42 });
    assertBakerIssueSet(result);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });

  it('missing fields → BakerIssueSet', async () => {
    const result = await baker.validate(SimpleDto, {});
    expect(isBakerIssueSet(result)).toBe(true);
  });

  it('null input → BakerIssueSet with invalidInput code', async () => {
    const result = await baker.validate(SimpleDto, null);
    assertBakerIssueSet(result);
    expect(result.errors[0]!.code).toBe('invalidInput');
  });

  it('array input → BakerIssueSet with invalidInput code', async () => {
    const result = await baker.validate(SimpleDto, [1, 2, 3]);
    assertBakerIssueSet(result);
    expect(result.errors[0]!.code).toBe('invalidInput');
  });

  it('sync DTO returns directly', () => {
    const result = baker.validate(SimpleDto, { name: 'Alice', age: 30, email: 'a@b.com' });
    expect(result).toBe(true);
  });
});

describe('validate DTO — nested', () => {
  it('valid nested → true', async () => {
    expect(await baker.validate(NestedUserDto, { name: 'Bob', address: { city: 'Seoul' } })).toBe(true);
  });

  it('invalid nested field → BakerIssueSet with nested path', async () => {
    const result = await baker.validate(NestedUserDto, { name: 'Bob', address: { city: '' } });
    assertBakerIssueSet(result);
    const paths = result.errors.map(e => e.path);
    expect(paths.some(p => p.includes('address'))).toBe(true);
  });

  it('rejects an array given for a nested DTO field without descending (consistent with deserialize)', async () => {
    const input = { name: 'Bob', address: [] };
    const v = await baker.validate(NestedUserDto, input);
    const d = await baker.deserialize(NestedUserDto, input);
    assertBakerIssueSet(v);
    assertBakerIssueSet(d);
    // The array must be rejected at the field itself, not validated as if it were an object.
    expect(v.errors.some(e => e.path.startsWith('address.'))).toBe(false);
    expect(v.errors.some(e => e.path === 'address')).toBe(true);
    // validate and deserialize agree on the rejection.
    expect(v.errors.map(e => `${e.path}:${e.code}`).sort()).toEqual(d.errors.map(e => `${e.path}:${e.code}`).sort());
  });
});

describe('validate DTO — consistency with deserialize', () => {
  it('validate returns true when deserialize succeeds', async () => {
    const input = { name: 'Alice', age: 30, email: 'alice@test.com' };
    const vResult = await baker.validate(SimpleDto, input);
    const dResult = await baker.deserialize(SimpleDto, input);
    expect(vResult).toBe(true);
    expect(isBakerIssueSet(dResult)).toBe(false);
  });

  it('validate returns BakerIssueSet when deserialize returns BakerIssueSet', async () => {
    const input = { name: 'A', age: -1, email: 'bad' };
    const vResult = await baker.validate(SimpleDto, input);
    const dResult = await baker.deserialize(SimpleDto, input);
    expect(isBakerIssueSet(vResult)).toBe(true);
    expect(isBakerIssueSet(dResult)).toBe(true);
  });

  it('same error codes from validate and deserialize', async () => {
    const input = { name: 123, age: 'x', email: 42 };
    const vResult = await baker.validate(SimpleDto, input);
    const dResult = await baker.deserialize(SimpleDto, input);
    assertBakerIssueSet(vResult);
    assertBakerIssueSet(dResult);
    const vCodes = vResult.errors.map(e => `${e.path}:${e.code}`).sort();
    const dCodes = dResult.errors.map(e => `${e.path}:${e.code}`).sort();
    expect(vCodes).toEqual(dCodes);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DTO-level — advanced scenarios
// ─────────────────────────────────────────────────────────────────────────────

describe('validate DTO — groups', () => {
  @baker.Recipe
  class GroupDto {
    @Field(isString) name!: string;
    @Field(isString, { groups: ['admin'] }) secret!: string;
  }

  it('without groups → validates non-group fields only', async () => {
    expect(await baker.validate(GroupDto, { name: 'Alice' })).toBe(true);
  });

  it('with groups → validates group fields too → passes when provided', async () => {
    expect(await baker.validate(GroupDto, { name: 'Alice', secret: 'key' }, { groups: ['admin'] })).toBe(true);
  });

  it('with groups → missing group field → fails', async () => {
    const result = await baker.validate(GroupDto, { name: 'Alice' }, { groups: ['admin'] });
    expect(isBakerIssueSet(result)).toBe(true);
  });
});

describe('validate DTO — optional/nullable', () => {
  @baker.Recipe
  class OptionalDto {
    @Field(isString, { optional: true }) nickname?: string;
    @Field(isString) name!: string;
  }

  it('optional field missing → passes', async () => {
    expect(await baker.validate(OptionalDto, { name: 'Alice' })).toBe(true);
  });

  it('optional field present but invalid → fails', async () => {
    const result = await baker.validate(OptionalDto, { name: 'Alice', nickname: 123 });
    expect(isBakerIssueSet(result)).toBe(true);
  });
});

describe('validate DTO — async', () => {
  @baker.Recipe
  class AsyncDto {
    @Field(isString, {
      transform: { deserialize: async ({ value }) => (value as string).trim(), serialize: ({ value }) => value },
    })
    name!: string;
  }

  it('async DTO valid → true', async () => {
    expect(await baker.validate(AsyncDto, { name: '  Alice  ' })).toBe(true);
  });

  it('async DTO missing field → BakerIssueSet', async () => {
    const result = await baker.validate(AsyncDto, {});
    expect(isBakerIssueSet(result)).toBe(true);
  });
});

describe('validate DTO — empty class', () => {
  it('seals a class with no @Field to an empty executor (no error)', () => {
    class EmptyDto {}
    expect(() => sealClass(EmptyDto)).not.toThrow();
  });
});

describe('validate — DTO mode', () => {
  it('validates a plain object against the class schema', async () => {
    const result = await baker.validate(SimpleDto, { name: 'Alice', age: 30, email: 'a@b.com' });
    expect(result).toBe(true);
  });
});
