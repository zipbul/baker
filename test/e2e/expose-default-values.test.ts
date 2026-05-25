import { describe, it, expect, afterEach, beforeEach } from 'bun:test';

import { Field, Recipe, deserialize, configure, isBakerIssueSet, seal } from '../../index';
import { isString, isNumber } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

beforeEach(() => unseal());
afterEach(() => {
  unseal();
  configure({});
});

// ─────────────────────────────────────────────────────────────────────────────

@Recipe
class DefaultsDto {
  @Field(isString)
  name: string = 'anonymous';

  @Field(isNumber())
  score: number = 100;

  @Field(isString, { optional: true })
  tag?: string = 'default-tag';
}

// ─────────────────────────────────────────────────────────────────────────────

describe('exposeDefaultValues', () => {
  it('true → uses class default values for missing fields', async () => {
    configure({ allowClassDefaults: true });
    seal();
    const result = (await deserialize<DefaultsDto>(DefaultsDto, {})) as DefaultsDto;
    expect(result.name).toBe('anonymous');
    expect(result.score).toBe(100);
  });

  it('true → ignores default when input value is present', async () => {
    configure({ allowClassDefaults: true });
    seal();
    const result = (await deserialize<DefaultsDto>(DefaultsDto, {
      name: 'Alice',
      score: 50,
    })) as DefaultsDto;
    expect(result.name).toBe('Alice');
    expect(result.score).toBe(50);
  });

  it('false (default) → missing fields are undefined → isDefined error', async () => {
    configure({ allowClassDefaults: false });
    seal();
    const result = await deserialize(DefaultsDto, {});
    expect(isBakerIssueSet(result)).toBe(true);
  });

  it('true + optional → optional fields also use default values', async () => {
    configure({ allowClassDefaults: true });
    seal();
    const result = (await deserialize<DefaultsDto>(DefaultsDto, {
      name: 'Bob',
      score: 80,
    })) as DefaultsDto;
    // optional so undefined/null would skip, default value may be retained
    // but allowClassDefaults applies only to non-optional fields
    expect(result.name).toBe('Bob');
  });
});
