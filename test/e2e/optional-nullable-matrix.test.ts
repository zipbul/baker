import { describe, it, expect, beforeEach } from 'bun:test';

import { Baker, deserialize, isBakerIssueSet, Field } from '../../index';
import { isString, isNumber, isBoolean, minLength } from '../../src/rules/index';

const baker = new Baker();

beforeEach(() => baker.seal());

type TryResult<T> = { ok: true; value: T } | { ok: false; codes: string[] };

async function tryDeserialize<T>(cls: new (...args: never[]) => T, input: unknown): Promise<TryResult<T>> {
  const result = await deserialize(cls, input);
  if (isBakerIssueSet(result)) {
    return { ok: false, codes: result.errors.map(x => x.code) };
  }
  return { ok: true, value: result };
}

/** Asserts r is success and returns the value (narrowing). */
function expectSuccess<T>(r: TryResult<T>): T {
  if (!r.ok) {
    throw new Error(`expected success, got codes: ${JSON.stringify(r.codes)}`);
  }
  return r.value;
}

/** Asserts r is failure and returns the codes (narrowing). */
function expectFailureCodes<T>(r: TryResult<T>): string[] {
  if (r.ok) {
    throw new Error('expected failure, got success');
  }
  return r.codes;
}

// ─── Matrix: 4 decorator states x 4 input values ────────────────────────────

/*
 * Decorator states:
 *   A: @Field(isString) — required (default)
 *   B: @Field(isString, { optional: true })
 *   C: @Field(isString, { nullable: true })
 *   D: @Field(isString, { optional: true, nullable: true })
 *
 * Input values:
 *   1: undefined (key missing)
 *   2: null
 *   3: valid string
 *   4: invalid (number)
 */

// ─── A: @Field(isString) (no Optional, no Nullable) ──────────────────────

describe('A: isString only', () => {
  @baker.Recipe
  class Dto {
    @Field(isString) v!: string;
  }

  it('undefined → rejected (default guard)', async () => {
    const r = await tryDeserialize(Dto, {});
    expect(r.ok).toBe(false);
  });

  it('null → rejected (default guard)', async () => {
    const r = await tryDeserialize(Dto, { v: null });
    expect(r.ok).toBe(false);
  });

  it('valid string → passes', async () => {
    const r = await tryDeserialize(Dto, { v: 'hello' });
    expect(r.ok).toBe(true);
    expect(expectSuccess(r).v).toBe('hello');
  });

  it('number → isString rejected', async () => {
    const r = await tryDeserialize(Dto, { v: 42 });
    expect(r.ok).toBe(false);
    expect(expectFailureCodes(r)).toContain('isString');
  });
});

// ─── B: optional + isString ───────────────────────────────────────────────

describe('B: optional + isString', () => {
  @baker.Recipe
  class Dto {
    @Field(isString, { optional: true })
    v?: string;
  }

  it('undefined → passes (Optional)', async () => {
    const r = await tryDeserialize(Dto, {});
    expect(r.ok).toBe(true);
    expect(expectSuccess(r).v).toBeUndefined();
  });

  it('null → passes (Optional skips null/undefined)', async () => {
    const r = await tryDeserialize(Dto, { v: null });
    expect(r.ok).toBe(true);
  });

  it('valid string → passes', async () => {
    const r = await tryDeserialize(Dto, { v: 'hello' });
    expect(r.ok).toBe(true);
    expect(expectSuccess(r).v).toBe('hello');
  });

  it('number → isString rejected', async () => {
    const r = await tryDeserialize(Dto, { v: 42 });
    expect(r.ok).toBe(false);
    expect(expectFailureCodes(r)).toContain('isString');
  });
});

// ─── C: nullable + isString ──────────────────────────────────────────────

describe('C: nullable + isString', () => {
  @baker.Recipe
  class Dto {
    @Field(isString, { nullable: true })
    v!: string | null;
  }

  it('undefined → rejected (Nullable does not allow undefined)', async () => {
    const r = await tryDeserialize(Dto, {});
    expect(r.ok).toBe(false);
  });

  it('null → passes (Nullable)', async () => {
    const r = await tryDeserialize(Dto, { v: null });
    expect(r.ok).toBe(true);
    expect(expectSuccess(r).v).toBeNull();
  });

  it('valid string → passes', async () => {
    const r = await tryDeserialize(Dto, { v: 'hello' });
    expect(r.ok).toBe(true);
    expect(expectSuccess(r).v).toBe('hello');
  });

  it('number → isString rejected', async () => {
    const r = await tryDeserialize(Dto, { v: 42 });
    expect(r.ok).toBe(false);
    expect(expectFailureCodes(r)).toContain('isString');
  });
});

// ─── D: optional + nullable + isString ──────────────────────────────────

describe('D: optional + nullable + isString', () => {
  @baker.Recipe
  class Dto {
    @Field(isString, { optional: true, nullable: true })
    v?: string | null;
  }

  it('undefined → passes', async () => {
    const r = await tryDeserialize(Dto, {});
    expect(r.ok).toBe(true);
    expect(expectSuccess(r).v).toBeUndefined();
  });

  it('null → passes', async () => {
    const r = await tryDeserialize(Dto, { v: null });
    expect(r.ok).toBe(true);
    expect(expectSuccess(r).v).toBeNull();
  });

  it('valid string → passes', async () => {
    const r = await tryDeserialize(Dto, { v: 'hello' });
    expect(r.ok).toBe(true);
    expect(expectSuccess(r).v).toBe('hello');
  });

  it('number → isString rejected', async () => {
    const r = await tryDeserialize(Dto, { v: 42 });
    expect(r.ok).toBe(false);
    expect(expectFailureCodes(r)).toContain('isString');
  });
});

// ─── E: nullable + isString (isDefined is default) ─────────────────────

describe('E: nullable + isString (required by default)', () => {
  @baker.Recipe
  class Dto {
    @Field(isString, { nullable: true })
    v!: string | null;
  }

  it('undefined (missing) → rejected', async () => {
    const r = await tryDeserialize(Dto, {});
    expect(r.ok).toBe(false);
  });

  it('null → passes (nullable allows null)', async () => {
    const r = await tryDeserialize(Dto, { v: null });
    expect(r.ok).toBe(true);
    expect(expectSuccess(r).v).toBeNull();
  });

  it('valid string → passes', async () => {
    const r = await tryDeserialize(Dto, { v: 'hello' });
    expect(r.ok).toBe(true);
    expect(expectSuccess(r).v).toBe('hello');
  });

  it('number → isString rejected', async () => {
    const r = await tryDeserialize(Dto, { v: 42 });
    expect(r.ok).toBe(false);
    expect(expectFailureCodes(r)).toContain('isString');
  });
});

// ─── G: empty string ("") handling ────────────────────────────────────────

describe('empty string ("") handling', () => {
  @baker.Recipe
  class StrDto {
    @Field(isString) v!: string;
  }
  @baker.Recipe
  class MinLenDto {
    @Field(isString, minLength(1)) v!: string;
  }

  it('isString allows empty string', async () => {
    const r = await tryDeserialize(StrDto, { v: '' });
    expect(r.ok).toBe(true);
    expect(expectSuccess(r).v).toBe('');
  });

  it('minLength(1) rejects empty string', async () => {
    const r = await tryDeserialize(MinLenDto, { v: '' });
    expect(r.ok).toBe(false);
    expect(expectFailureCodes(r)).toContain('minLength');
  });
});

// ─── H: false, 0 and other falsy value handling ──────────────────────────

describe('falsy value handling', () => {
  @baker.Recipe
  class NumDto {
    @Field(isNumber()) v!: number;
  }
  @baker.Recipe
  class BoolDto {
    @Field(isBoolean) v!: boolean;
  }

  it('0 passes isNumber', async () => {
    const r = await tryDeserialize(NumDto, { v: 0 });
    expect(r.ok).toBe(true);
    expect(expectSuccess(r).v).toBe(0);
  });

  it('false passes isBoolean', async () => {
    const r = await tryDeserialize(BoolDto, { v: false });
    expect(r.ok).toBe(true);
    expect(expectSuccess(r).v).toBe(false);
  });
});
