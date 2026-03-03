import { describe, it, expect, afterEach } from 'bun:test';
import { seal, deserialize, BakerValidationError, IsString, IsNumber, IsDefined, IsOptional } from '../../index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class DefinedDto {
  @IsDefined()
  @IsString()
  name!: string;
}

class OptionalDto {
  @IsOptional()
  @IsString()
  nickname?: string;
}

class DefinedOverrideDto {
  @IsDefined()
  @IsOptional()
  @IsString()
  tag!: string;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('@IsDefined', () => {
  it('undefined → isDefined 에러', async () => {
    seal();
    try {
      await deserialize(DefinedDto, {});
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BakerValidationError);
      expect((e as BakerValidationError).errors.some(e => e.code === 'isDefined')).toBe(true);
    }
  });

  it('유효 값 → 통과', async () => {
    seal();
    const result = await deserialize<DefinedDto>(DefinedDto, { name: 'Alice' });
    expect(result.name).toBe('Alice');
  });

  it('빈 문자열 → isDefined 통과, isString 검증으로 진행', async () => {
    seal();
    const result = await deserialize<DefinedDto>(DefinedDto, { name: '' });
    expect(result.name).toBe('');
  });
});

describe('@IsOptional', () => {
  it('undefined → skip', async () => {
    seal();
    const result = await deserialize<OptionalDto>(OptionalDto, {});
    expect(result.nickname).toBeUndefined();
  });

  it('null → skip', async () => {
    seal();
    const result = await deserialize<OptionalDto>(OptionalDto, { nickname: null });
    expect(result.nickname).toBeUndefined();
  });

  it('유효 값 → 검증 통과', async () => {
    seal();
    const result = await deserialize<OptionalDto>(OptionalDto, { nickname: 'Bob' });
    expect(result.nickname).toBe('Bob');
  });
});

describe('@IsDefined + @IsOptional 동시 선언', () => {
  it('@IsDefined 우선 → undefined 거부', async () => {
    seal();
    await expect(
      deserialize(DefinedOverrideDto, {}),
    ).rejects.toThrow(BakerValidationError);
  });
});
