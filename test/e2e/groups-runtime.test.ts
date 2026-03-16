import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Field, deserialize, serialize, toJsonSchema, BakerValidationError } from '../../index';
import { isString, isNumber, min, max } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

beforeEach(() => unseal());
afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class GroupDto {
  @Field(isString)
  name!: string;

  @Field(isString, { groups: ['admin'] })
  secret!: string;

  @Field(isNumber())
  @Field(min(0), { groups: ['create'] })
  @Field(max(100), { groups: ['update'] })
  score!: number;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('groups — deserialize', () => {
  it('그룹 일치 → 필드 포함', async () => {
    const result = await deserialize<GroupDto>(GroupDto, {
      name: 'Alice', secret: 'top', score: 50,
    }, { groups: ['admin'] });
    expect(result.secret).toBe('top');
  });

  it('그룹 불일치 → 필드 제외', async () => {
    const result = await deserialize<GroupDto>(GroupDto, {
      name: 'Alice', secret: 'top', score: 50,
    }, { groups: ['user'] });
    expect(result.secret).toBeUndefined();
  });

  it('그룹 없음 → Expose groups 필드 제외', async () => {
    const result = await deserialize<GroupDto>(GroupDto, {
      name: 'Bob', secret: 'x', score: 50,
    });
    expect(result.secret).toBeUndefined();
  });

  it('rule groups — create 그룹 → @Min 적용, @Max 미적용', async () => {
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
    const dto = Object.assign(new GroupDto(), { name: 'Alice', secret: 'top', score: 50 });
    const result = await serialize(dto, { groups: ['admin'] });
    expect(result['secret']).toBe('top');
  });

  it('그룹 불일치 → 필드 미출력', async () => {
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
    expect(s.properties!.score!.minimum).toBe(0);
    expect(s.properties!.score!.maximum).toBeUndefined();
  });

  it('rule groups 필터링 — update', () => {
    const s = toJsonSchema(GroupDto, { groups: ['update'] });
    expect(s.properties!.score!.maximum).toBe(100);
    expect(s.properties!.score!.minimum).toBeUndefined();
  });
});

// ─── E-22: groups + directional exclude combo ───────────────────────────────

describe('E-22: groups + directional exclude combo', () => {
  class AdminExcludeDto {
    @Field(isString)
    name!: string;

    @Field(isString, { groups: ['admin'], exclude: 'serializeOnly' })
    adminSecret!: string;

    @Field(isString, { groups: ['public'], serializeName: 'x' })
    label!: string;
  }

  it('admin group deserialize → adminSecret visible', async () => {
    const r = await deserialize<AdminExcludeDto>(AdminExcludeDto, {
      name: 'Alice', adminSecret: 'secret123', label: 'hello',
    }, { groups: ['admin', 'public'] });
    expect(r.adminSecret).toBe('secret123');
  });

  it('admin group serialize → adminSecret excluded (serializeOnly exclude)', async () => {
    const dto = Object.assign(new AdminExcludeDto(), {
      name: 'Alice', adminSecret: 'secret123', label: 'hello',
    });
    const result = await serialize(dto, { groups: ['admin', 'public'] });
    expect(result['adminSecret']).toBeUndefined();
    expect(result['name']).toBe('Alice');
  });

  it('public group serialize → label serialized as "x"', async () => {
    const dto = Object.assign(new AdminExcludeDto(), {
      name: 'Bob', adminSecret: 'sec', label: 'world',
    });
    const result = await serialize(dto, { groups: ['public'] });
    expect(result['x']).toBe('world');
    expect(result['label']).toBeUndefined();
  });

  it('no groups → adminSecret and label excluded', async () => {
    const r = await deserialize<AdminExcludeDto>(AdminExcludeDto, {
      name: 'Carol', adminSecret: 'sec', label: 'test',
    });
    expect(r.adminSecret).toBeUndefined();
    expect(r.label).toBeUndefined();
  });
});
