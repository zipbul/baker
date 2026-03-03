import { describe, it, expect, afterEach } from 'bun:test';
import { seal, deserialize, IsString, IsNumber, IsOptional, IsNullable, Min, Max, toJsonSchema } from '../../index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class NullableStringDto {
  @IsNullable()
  @IsString()
  nickname!: string | null;

  @IsString()
  name!: string;
}

class NullableOptionalDto {
  @IsNullable()
  @IsOptional()
  @IsString()
  bio!: string | null | undefined;
}

class NullableNumberDto {
  @IsNullable()
  @IsNumber()
  @Min(0)
  @Max(200)
  age!: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('@IsNullable 역직렬화', () => {
  it('null 값 허용', async () => {
    seal();
    const result = await deserialize<NullableStringDto>(NullableStringDto, {
      nickname: null, name: 'Alice',
    });
    expect(result.nickname).toBeNull();
    expect(result.name).toBe('Alice');
  });

  it('유효 값 통과', async () => {
    seal();
    const result = await deserialize<NullableStringDto>(NullableStringDto, {
      nickname: 'bob', name: 'Alice',
    });
    expect(result.nickname).toBe('bob');
  });

  it('undefined → 거부 (@IsNullable without @IsOptional)', async () => {
    seal();
    await expect(
      deserialize(NullableStringDto, { name: 'Alice' }),
    ).rejects.toThrow();
  });

  it('@IsNullable + @IsOptional → null과 undefined 모두 허용', async () => {
    seal();
    const r1 = await deserialize<NullableOptionalDto>(NullableOptionalDto, { bio: null });
    expect(r1.bio).toBeNull();

    const r2 = await deserialize<NullableOptionalDto>(NullableOptionalDto, {});
    expect(r2.bio).toBeUndefined();
  });

  it('nullable number null → 할당, 유효 값 → 검증 통과', async () => {
    seal();
    const r1 = await deserialize<NullableNumberDto>(NullableNumberDto, { age: null });
    expect(r1.age).toBeNull();

    const r2 = await deserialize<NullableNumberDto>(NullableNumberDto, { age: 25 });
    expect(r2.age).toBe(25);
  });

  it('nullable number 범위 위반 → 에러', async () => {
    seal();
    await expect(deserialize(NullableNumberDto, { age: -1 })).rejects.toThrow();
  });
});

describe('@IsNullable toJsonSchema', () => {
  it('type 배열에 "null" 추가', () => {
    const schema = toJsonSchema(NullableStringDto);
    expect(schema.properties!.nickname).toEqual({ type: ['string', 'null'] });
    expect(schema.properties!.name).toEqual({ type: 'string' });
  });

  it('@IsNullable + @IsNumber → ["number", "null"] with constraints', () => {
    const schema = toJsonSchema(NullableNumberDto);
    expect(schema.properties!.age).toEqual({
      type: ['number', 'null'], minimum: 0, maximum: 200,
    });
  });
});
