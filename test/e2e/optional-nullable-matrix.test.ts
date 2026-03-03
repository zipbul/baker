import { describe, it, expect, afterEach } from 'bun:test';
import {
  seal, deserialize, BakerValidationError,
  IsString, IsNumber, IsBoolean, IsOptional, IsNullable, IsDefined, MinLength,
} from '../../index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

/** 헬퍼: 에러 코드 추출 (없으면 null) */
async function tryDeserialize(cls: Function, input: unknown): Promise<{ ok: true; value: any } | { ok: false; codes: string[] }> {
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
 *   A: (없음) @IsString만
 *   B: @IsOptional @IsString
 *   C: @IsNullable @IsString
 *   D: @IsOptional @IsNullable @IsString
 *
 * 입력값:
 *   1: undefined (키 누락)
 *   2: null
 *   3: 유효 문자열
 *   4: 무효 (숫자)
 */

// ─── A: @IsString만 (no Optional, no Nullable) ─────────────────────────────

describe('A: @IsString만', () => {
  class Dto { @IsString() v!: string; }

  it('undefined → 거부 (기본 가드)', async () => {
    seal();
    const r = await tryDeserialize(Dto, {});
    expect(r.ok).toBe(false);
  });

  it('null → 거부 (기본 가드)', async () => {
    seal();
    const r = await tryDeserialize(Dto, { v: null });
    expect(r.ok).toBe(false);
  });

  it('유효 문자열 → 통과', async () => {
    seal();
    const r = await tryDeserialize(Dto, { v: 'hello' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.v).toBe('hello');
  });

  it('숫자 → isString 거부', async () => {
    seal();
    const r = await tryDeserialize(Dto, { v: 42 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codes).toContain('isString');
  });
});

// ─── B: @IsOptional + @IsString ────────────────────────────────────────────

describe('B: @IsOptional + @IsString', () => {
  class Dto {
    @IsOptional()
    @IsString()
    v?: string;
  }

  it('undefined → 통과 (Optional)', async () => {
    seal();
    const r = await tryDeserialize(Dto, {});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.v).toBeUndefined();
  });

  it('null → 통과 (Optional은 null/undefined 스킵)', async () => {
    seal();
    const r = await tryDeserialize(Dto, { v: null });
    expect(r.ok).toBe(true);
    // @IsOptional는 null/undefined를 스킵 — 값은 그대로 undefined가 될 수 있음
  });

  it('유효 문자열 → 통과', async () => {
    seal();
    const r = await tryDeserialize(Dto, { v: 'hello' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.v).toBe('hello');
  });

  it('숫자 → isString 거부', async () => {
    seal();
    const r = await tryDeserialize(Dto, { v: 42 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codes).toContain('isString');
  });
});

// ─── C: @IsNullable + @IsString ───────────────────────────────────────────

describe('C: @IsNullable + @IsString', () => {
  class Dto {
    @IsNullable()
    @IsString()
    v!: string | null;
  }

  it('undefined → 거부 (Nullable는 undefined 허용 안 함)', async () => {
    seal();
    const r = await tryDeserialize(Dto, {});
    expect(r.ok).toBe(false);
  });

  it('null → 통과 (Nullable)', async () => {
    seal();
    const r = await tryDeserialize(Dto, { v: null });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.v).toBeNull();
  });

  it('유효 문자열 → 통과', async () => {
    seal();
    const r = await tryDeserialize(Dto, { v: 'hello' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.v).toBe('hello');
  });

  it('숫자 → isString 거부', async () => {
    seal();
    const r = await tryDeserialize(Dto, { v: 42 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codes).toContain('isString');
  });
});

// ─── D: @IsOptional + @IsNullable + @IsString ─────────────────────────────

describe('D: @IsOptional + @IsNullable + @IsString', () => {
  class Dto {
    @IsOptional()
    @IsNullable()
    @IsString()
    v?: string | null;
  }

  it('undefined → 통과', async () => {
    seal();
    const r = await tryDeserialize(Dto, {});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.v).toBeUndefined();
  });

  it('null → 통과', async () => {
    seal();
    const r = await tryDeserialize(Dto, { v: null });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.v).toBeNull();
  });

  it('유효 문자열 → 통과', async () => {
    seal();
    const r = await tryDeserialize(Dto, { v: 'hello' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.v).toBe('hello');
  });

  it('숫자 → isString 거부', async () => {
    seal();
    const r = await tryDeserialize(Dto, { v: 42 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codes).toContain('isString');
  });
});

// ─── E: @IsDefined + @IsNullable + @IsString ──────────────────────────────

describe('E: @IsDefined + @IsNullable + @IsString', () => {
  class Dto {
    @IsDefined()
    @IsNullable()
    @IsString()
    v!: string | null;
  }

  it('undefined (누락) → isDefined 거부', async () => {
    seal();
    const r = await tryDeserialize(Dto, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codes).toContain('isDefined');
  });

  it('null → 통과 (@IsNullable가 null 허용)', async () => {
    seal();
    const r = await tryDeserialize(Dto, { v: null });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.v).toBeNull();
  });

  it('유효 문자열 → 통과', async () => {
    seal();
    const r = await tryDeserialize(Dto, { v: 'hello' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.v).toBe('hello');
  });

  it('숫자 → isString 거부', async () => {
    seal();
    const r = await tryDeserialize(Dto, { v: 42 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codes).toContain('isString');
  });
});

// ─── F: @IsDefined + @IsOptional + @IsString (모순 조합) ──────────────────

describe('F: @IsDefined + @IsOptional + @IsString (모순)', () => {
  class Dto {
    @IsDefined()
    @IsOptional()
    @IsString()
    v!: string;
  }

  it('undefined → @IsDefined가 우선 (거부)', async () => {
    seal();
    const r = await tryDeserialize(Dto, {});
    // @IsDefined가 @IsOptional보다 우선 → undefined 거부
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codes).toContain('isDefined');
  });

  it('유효 문자열 → 통과', async () => {
    seal();
    const r = await tryDeserialize(Dto, { v: 'hello' });
    expect(r.ok).toBe(true);
  });
});

// ─── G: 빈 문자열("") 처리 ────────────────────────────────────────────────

describe('빈 문자열("") 처리', () => {
  class StrDto { @IsString() v!: string; }
  class MinLenDto { @IsString() @MinLength(1) v!: string; }

  it('@IsString은 빈 문자열 허용', async () => {
    seal();
    const r = await tryDeserialize(StrDto, { v: '' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.v).toBe('');
  });

  it('@MinLength(1)은 빈 문자열 거부', async () => {
    seal();
    const r = await tryDeserialize(MinLenDto, { v: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codes).toContain('minLength');
  });
});

// ─── H: false, 0 등 falsy 값 처리 ─────────────────────────────────────────

describe('falsy 값 처리', () => {
  class NumDto { @IsNumber() v!: number; }
  class BoolDto { @IsBoolean() v!: boolean; }

  it('0은 @IsNumber 통과', async () => {
    seal();
    const r = await tryDeserialize(NumDto, { v: 0 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.v).toBe(0);
  });

  it('false는 @IsBoolean 통과', async () => {
    seal();
    const r = await tryDeserialize(BoolDto, { v: false });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.v).toBe(false);
  });
});
