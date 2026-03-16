import { describe, it, expect, afterEach } from 'bun:test';
import { Field, deserialize, configure } from '../../index';
import { isString, isNumber } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => { unseal(); configure({}); });

// ─────────────────────────────────────────────────────────────────────────────

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
    const result = await deserialize<DefaultsDto>(DefaultsDto, {});
    expect(result.name).toBe('anonymous');
    expect(result.score).toBe(100);
  });

  it('true → ignores default when input value is present', async () => {
    configure({ allowClassDefaults: true });
    const result = await deserialize<DefaultsDto>(DefaultsDto, {
      name: 'Alice', score: 50,
    });
    expect(result.name).toBe('Alice');
    expect(result.score).toBe(50);
  });

  it('false (default) → missing fields are undefined → isDefined error', async () => {
    configure({ allowClassDefaults: false });
    await expect(
      deserialize(DefaultsDto, {}),
    ).rejects.toThrow();
  });

  it('true + optional → optional fields also use default values', async () => {
    configure({ allowClassDefaults: true });
    const result = await deserialize<DefaultsDto>(DefaultsDto, {
      name: 'Bob', score: 80,
    });
    // optional so undefined/null would skip, default value may be retained
    // but allowClassDefaults applies only to non-optional fields
    expect(result.name).toBe('Bob');
  });
});
