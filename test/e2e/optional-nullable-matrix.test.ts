import { describe, it, expect } from 'bun:test';
import { deserialize, BakerValidationError, Field } from '../../index';
import { isString, isNumber, isBoolean, minLength } from '../../src/rules/index';
/** 헬퍼: 에러 코드 추출 (없으면 null) */
async function tryDeserialize(cls: new (...args: any[]) => any, input: unknown): Promise<{ ok: true; value: any } | { ok: false; codes: string[] }> {
  try {
    const value = await deserialize(cls, input);
    return { ok: true, value };
  } catch (e) {
    if (!(e instanceof BakerValidationError)) throw e;
    return { ok: false, codes: e.errors.map(x => x.code) };
  }
}

// ─── 매트릭스: 4개 데코레이터 상태 × 4개 입력값 ────────────────────────────

/*
 * 데코레이터 상태:
 *   A: @Field(isString) — required (default)
 *   B: @Field(isString, { optional: true })
 *   C: @Field(isString, { nullable: true })
 *   D: @Field(isString, { optional: true, nullable: true })
 *
 * 입력값:
 *   1: undefined (키 누락)
 *   2: null
 *   3: 유효 문자열
 *   4: 무효 (숫자)
 */

// ─── A: @Field(isString) (no Optional, no Nullable) ──────────────────────

describe('A: isString만', () => {
  class Dto { @Field(isString) v!: string; }

  it('undefined → 거부 (기본 가드)', async () => {
    const r = await tryDeserialize(Dto, {});
    expect(r.ok).toBe(false);
  });

  it('null → 거부 (기본 가드)', async () => {
    const r = await tryDeserialize(Dto, { v: null });
    expect(r.ok).toBe(false);
  });

  it('유효 문자열 → 통과', async () => {
    const r = await tryDeserialize(Dto, { v: 'hello' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.v).toBe('hello');
  });

  it('숫자 → isString 거부', async () => {
    const r = await tryDeserialize(Dto, { v: 42 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codes).toContain('isString');
  });
});

// ─── B: optional + isString ───────────────────────────────────────────────

describe('B: optional + isString', () => {
  class Dto {
    @Field(isString, { optional: true })
    v?: string;
  }

  it('undefined → 통과 (Optional)', async () => {
    const r = await tryDeserialize(Dto, {});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.v).toBeUndefined();
  });

  it('null → 통과 (Optional은 null/undefined 스킵)', async () => {
    const r = await tryDeserialize(Dto, { v: null });
    expect(r.ok).toBe(true);
    // optional은 null/undefined를 스킵 — 값은 그대로 undefined가 될 수 있음
  });

  it('유효 문자열 → 통과', async () => {
    const r = await tryDeserialize(Dto, { v: 'hello' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.v).toBe('hello');
  });

  it('숫자 → isString 거부', async () => {
    const r = await tryDeserialize(Dto, { v: 42 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codes).toContain('isString');
  });
});

// ─── C: nullable + isString ──────────────────────────────────────────────

describe('C: nullable + isString', () => {
  class Dto {
    @Field(isString, { nullable: true })
    v!: string | null;
  }

  it('undefined → 거부 (Nullable는 undefined 허용 안 함)', async () => {
    const r = await tryDeserialize(Dto, {});
    expect(r.ok).toBe(false);
  });

  it('null → 통과 (Nullable)', async () => {
    const r = await tryDeserialize(Dto, { v: null });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.v).toBeNull();
  });

  it('유효 문자열 → 통과', async () => {
    const r = await tryDeserialize(Dto, { v: 'hello' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.v).toBe('hello');
  });

  it('숫자 → isString 거부', async () => {
    const r = await tryDeserialize(Dto, { v: 42 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codes).toContain('isString');
  });
});

// ─── D: optional + nullable + isString ──────────────────────────────────

describe('D: optional + nullable + isString', () => {
  class Dto {
    @Field(isString, { optional: true, nullable: true })
    v?: string | null;
  }

  it('undefined → 통과', async () => {
    const r = await tryDeserialize(Dto, {});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.v).toBeUndefined();
  });

  it('null → 통과', async () => {
    const r = await tryDeserialize(Dto, { v: null });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.v).toBeNull();
  });

  it('유효 문자열 → 통과', async () => {
    const r = await tryDeserialize(Dto, { v: 'hello' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.v).toBe('hello');
  });

  it('숫자 → isString 거부', async () => {
    const r = await tryDeserialize(Dto, { v: 42 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codes).toContain('isString');
  });
});

// ─── E: nullable + isString (isDefined is default) ─────────────────────

describe('E: nullable + isString (required by default)', () => {
  class Dto {
    @Field(isString, { nullable: true })
    v!: string | null;
  }

  it('undefined (누락) → 거부', async () => {
    const r = await tryDeserialize(Dto, {});
    expect(r.ok).toBe(false);
  });

  it('null → 통과 (nullable가 null 허용)', async () => {
    const r = await tryDeserialize(Dto, { v: null });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.v).toBeNull();
  });

  it('유효 문자열 → 통과', async () => {
    const r = await tryDeserialize(Dto, { v: 'hello' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.v).toBe('hello');
  });

  it('숫자 → isString 거부', async () => {
    const r = await tryDeserialize(Dto, { v: 42 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codes).toContain('isString');
  });
});

// ─── G: 빈 문자열("") 처리 ────────────────────────────────────────────────

describe('빈 문자열("") 처리', () => {
  class StrDto { @Field(isString) v!: string; }
  class MinLenDto { @Field(isString, minLength(1)) v!: string; }

  it('isString은 빈 문자열 허용', async () => {
    const r = await tryDeserialize(StrDto, { v: '' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.v).toBe('');
  });

  it('minLength(1)은 빈 문자열 거부', async () => {
    const r = await tryDeserialize(MinLenDto, { v: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codes).toContain('minLength');
  });
});

// ─── H: false, 0 등 falsy 값 처리 ─────────────────────────────────────────

describe('falsy 값 처리', () => {
  class NumDto { @Field(isNumber()) v!: number; }
  class BoolDto { @Field(isBoolean) v!: boolean; }

  it('0은 isNumber 통과', async () => {
    const r = await tryDeserialize(NumDto, { v: 0 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.v).toBe(0);
  });

  it('false는 isBoolean 통과', async () => {
    const r = await tryDeserialize(BoolDto, { v: false });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.v).toBe(false);
  });
});
