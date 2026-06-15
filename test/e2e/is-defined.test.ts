import { describe, it, expect, beforeEach } from 'bun:test';

import { Baker, Field, isBakerIssueSet } from '../../index';
import { isString } from '../../src/rules/index';
import { assertBakerIssueSet } from '../integration/helpers/assert';

const baker = new Baker();

beforeEach(() => baker.seal());

// ─────────────────────────────────────────────────────────────────────────────

@baker.Recipe
class DefinedDto {
  @Field(isString)
  name!: string;
}

@baker.Recipe
class OptionalDto {
  @Field(isString, { optional: true })
  nickname?: string;
}

@baker.Recipe
class DefinedOverrideDto {
  @Field(isString)
  tag!: string;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('@IsDefined (implicit in new API)', () => {
  it('undefined → isDefined error', async () => {
    const result = await baker.deserialize(DefinedDto, {});
    assertBakerIssueSet(result);
    expect(result.errors.some(e => e.code === 'isDefined')).toBe(true);
  });

  it('valid value → passes', async () => {
    const result = (await baker.deserialize<DefinedDto>(DefinedDto, { name: 'Alice' })) as DefinedDto;
    expect(result.name).toBe('Alice');
  });

  it('empty string → passes isDefined, proceeds to isString validation', async () => {
    const result = (await baker.deserialize<DefinedDto>(DefinedDto, { name: '' })) as DefinedDto;
    expect(result.name).toBe('');
  });
});

describe('optional', () => {
  it('undefined → skip', async () => {
    const result = (await baker.deserialize<OptionalDto>(OptionalDto, {})) as OptionalDto;
    expect(result.nickname).toBeUndefined();
  });

  it('null → skip', async () => {
    const result = (await baker.deserialize<OptionalDto>(OptionalDto, { nickname: null })) as OptionalDto;
    expect(result.nickname).toBeUndefined();
  });

  it('valid value → validation passes', async () => {
    const result = (await baker.deserialize<OptionalDto>(OptionalDto, { nickname: 'Bob' })) as OptionalDto;
    expect(result.nickname).toBe('Bob');
  });
});

describe('required field (not optional) → undefined rejected', () => {
  it('required → undefined rejected', async () => {
    const result = await baker.deserialize(DefinedOverrideDto, {});
    expect(isBakerIssueSet(result)).toBe(true);
  });
});
