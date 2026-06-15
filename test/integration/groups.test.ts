import { describe, it, expect, beforeEach } from 'bun:test';

import { Baker, Field } from '../../index';
import { isString, isNumber } from '../../src/rules/index';

const baker = new Baker();

// ─── DTOs ────────────────────────────────────────────────────────────────────

@baker.Recipe
class AdminDto {
  @Field(isString)
  name!: string;

  @Field(isString, { groups: ['admin'] })
  internalCode?: string;
}

@baker.Recipe
class GroupedSerialDto {
  @Field(isString)
  name!: string;

  @Field(isNumber(), { groups: ['public'] })
  score?: number;
}

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => baker.seal());

describe('groups — integration', () => {
  it('should deserialize group-gated field when group is provided', async () => {
    const result = (await baker.deserialize<AdminDto>(
      AdminDto,
      { name: 'Alice', internalCode: 'XYZ' },
      { groups: ['admin'] },
    )) as AdminDto;
    expect(result.name).toBe('Alice');
    expect(result.internalCode).toBe('XYZ');
  });

  it('should skip group-gated field when group is NOT provided', async () => {
    const result = (await baker.deserialize<AdminDto>(AdminDto, { name: 'Alice', internalCode: 'XYZ' })) as AdminDto;
    expect(result.name).toBe('Alice');
    // internalCode is group-gated — not processed without group
    expect(result.internalCode).toBeUndefined();
  });

  it('should skip group-gated field when wrong group provided', async () => {
    const result = (await baker.deserialize<AdminDto>(
      AdminDto,
      { name: 'Bob', internalCode: 'ABC' },
      { groups: ['user'] },
    )) as AdminDto;
    expect(result.internalCode).toBeUndefined();
  });

  it('should serialize group-gated field when group matches', async () => {
    const dto = Object.assign(new GroupedSerialDto(), { name: 'Carol', score: 99 });
    const result = await baker.serialize(dto, { groups: ['public'] });
    expect(result['score']).toBe(99);
  });

  it('should omit group-gated field during serialize when no group provided', async () => {
    const dto = Object.assign(new GroupedSerialDto(), { name: 'Dave', score: 85 });
    const result = await baker.serialize(dto);
    expect(result['score']).toBeUndefined();
  });
});
