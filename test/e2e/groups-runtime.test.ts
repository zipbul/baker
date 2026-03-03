import { describe, it, expect, afterEach } from 'bun:test';
import { seal, deserialize, serialize, toJsonSchema, IsString, IsNumber, Expose, Min, Max } from '../../index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class GroupDto {
  @IsString()
  name!: string;

  @Expose({ groups: ['admin'] })
  @IsString()
  secret!: string;

  @IsNumber()
  @Min(0, { groups: ['create'] })
  @Max(100, { groups: ['update'] })
  score!: number;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('groups — deserialize', () => {
  it('그룹 일치 → 필드 포함', async () => {
    seal();
    const result = await deserialize<GroupDto>(GroupDto, {
      name: 'Alice', secret: 'top', score: 50,
    }, { groups: ['admin'] });
    expect(result.secret).toBe('top');
  });

  it('그룹 불일치 → 필드 제외', async () => {
    seal();
    const result = await deserialize<GroupDto>(GroupDto, {
      name: 'Alice', secret: 'top', score: 50,
    }, { groups: ['user'] });
    expect(result.secret).toBeUndefined();
  });

  it('그룹 없음 → Expose groups 필드 제외', async () => {
    seal();
    const result = await deserialize<GroupDto>(GroupDto, {
      name: 'Bob', secret: 'x', score: 50,
    });
    expect(result.secret).toBeUndefined();
  });

  it('rule groups — create 그룹 → @Min 적용, @Max 미적용', async () => {
    seal();
    await expect(
      deserialize(GroupDto, { name: 'X', secret: 'x', score: -1 }, { groups: ['admin', 'create'] }),
    ).rejects.toThrow();

    // Max 미적용 → 200 통과
    const r = await deserialize<GroupDto>(GroupDto, {
      name: 'Y', secret: 'x', score: 200,
    }, { groups: ['admin', 'create'] });
    expect(r.score).toBe(200);
  });
});

describe('groups — serialize', () => {
  it('그룹 일치 → 필드 출력', async () => {
    seal();
    const dto = Object.assign(new GroupDto(), { name: 'Alice', secret: 'top', score: 50 });
    const result = await serialize(dto, { groups: ['admin'] });
    expect(result['secret']).toBe('top');
  });

  it('그룹 불일치 → 필드 미출력', async () => {
    seal();
    const dto = Object.assign(new GroupDto(), { name: 'Bob', secret: 'top', score: 50 });
    const result = await serialize(dto);
    expect(result['secret']).toBeUndefined();
  });
});

describe('groups — toJsonSchema', () => {
  it('expose groups 불일치 → 필드 제외', () => {
    const s = toJsonSchema(GroupDto, { groups: ['user'] });
    expect(s.properties!.name).toBeDefined();
    expect(s.properties!.secret).toBeUndefined();
  });

  it('rule groups 필터링 — create', () => {
    const s = toJsonSchema(GroupDto, { groups: ['create'] });
    expect(s.properties!.score.minimum).toBe(0);
    expect(s.properties!.score.maximum).toBeUndefined();
  });

  it('rule groups 필터링 — update', () => {
    const s = toJsonSchema(GroupDto, { groups: ['update'] });
    expect(s.properties!.score.maximum).toBe(100);
    expect(s.properties!.score.minimum).toBeUndefined();
  });
});
