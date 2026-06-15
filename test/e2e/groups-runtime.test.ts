import { describe, it, expect, beforeEach } from 'bun:test';

import { Baker, ExcludeMode, Field, isBakerIssueSet } from '../../index';
import { isString, isNumber, min, max } from '../../src/rules/index';

const baker = new Baker();

beforeEach(() => baker.seal());

// ─────────────────────────────────────────────────────────────────────────────

@baker.Recipe
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
  it('group match → field included', async () => {
    const result = (await baker.deserialize<GroupDto>(
      GroupDto,
      {
        name: 'Alice',
        secret: 'top',
        score: 50,
      },
      { groups: ['admin'] },
    )) as GroupDto;
    expect(result.secret).toBe('top');
  });

  it('group mismatch → field excluded', async () => {
    const result = (await baker.deserialize<GroupDto>(
      GroupDto,
      {
        name: 'Alice',
        secret: 'top',
        score: 50,
      },
      { groups: ['user'] },
    )) as GroupDto;
    expect(result.secret).toBeUndefined();
  });

  it('no groups → expose groups field excluded', async () => {
    const result = (await baker.deserialize<GroupDto>(GroupDto, {
      name: 'Bob',
      secret: 'x',
      score: 50,
    })) as GroupDto;
    expect(result.secret).toBeUndefined();
  });

  it('rule groups — create group → @Min applied, @Max not applied', async () => {
    expect(
      isBakerIssueSet(await baker.deserialize(GroupDto, { name: 'X', secret: 'x', score: -1 }, { groups: ['admin', 'create'] })),
    ).toBe(true);

    // Max not applied → 200 passes
    const r = (await baker.deserialize<GroupDto>(
      GroupDto,
      {
        name: 'Y',
        secret: 'x',
        score: 200,
      },
      { groups: ['admin', 'create'] },
    )) as GroupDto;
    expect(r.score).toBe(200);
  });
});

describe('groups — serialize', () => {
  it('group match → field output', async () => {
    const dto = Object.assign(new GroupDto(), { name: 'Alice', secret: 'top', score: 50 });
    const result = await baker.serialize(dto, { groups: ['admin'] });
    expect(result['secret']).toBe('top');
  });

  it('group mismatch → field not output', async () => {
    const dto = Object.assign(new GroupDto(), { name: 'Bob', secret: 'top', score: 50 });
    const result = await baker.serialize(dto);
    expect(result['secret']).toBeUndefined();
  });
});

// ─── E-22: groups + directional exclude combo ───────────────────────────────

describe('E-22: groups + directional exclude combo', () => {
  @baker.Recipe
  class AdminExcludeDto {
    @Field(isString)
    name!: string;

    @Field(isString, { groups: ['admin'], exclude: ExcludeMode.SerializeOnly })
    adminSecret!: string;

    @Field(isString, { groups: ['public'], serializeName: 'x' })
    label!: string;
  }

  it('admin group deserialize → adminSecret visible', async () => {
    const r = (await baker.deserialize<AdminExcludeDto>(
      AdminExcludeDto,
      {
        name: 'Alice',
        adminSecret: 'secret123',
        label: 'hello',
      },
      { groups: ['admin', 'public'] },
    )) as AdminExcludeDto;
    expect(r.adminSecret).toBe('secret123');
  });

  it('admin group serialize → adminSecret excluded (serializeOnly exclude)', async () => {
    const dto = Object.assign(new AdminExcludeDto(), {
      name: 'Alice',
      adminSecret: 'secret123',
      label: 'hello',
    });
    const result = await baker.serialize(dto, { groups: ['admin', 'public'] });
    expect(result['adminSecret']).toBeUndefined();
    expect(result['name']).toBe('Alice');
  });

  it('public group serialize → label serialized as "x"', async () => {
    const dto = Object.assign(new AdminExcludeDto(), {
      name: 'Bob',
      adminSecret: 'sec',
      label: 'world',
    });
    const result = await baker.serialize(dto, { groups: ['public'] });
    expect(result['x']).toBe('world');
    expect(result['label']).toBeUndefined();
  });

  it('no groups → adminSecret and label excluded', async () => {
    const r = (await baker.deserialize<AdminExcludeDto>(AdminExcludeDto, {
      name: 'Carol',
      adminSecret: 'sec',
      label: 'test',
    })) as AdminExcludeDto;
    expect(r.adminSecret).toBeUndefined();
    expect(r.label).toBeUndefined();
  });
});
