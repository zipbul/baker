import { describe, it, expect, afterEach } from 'bun:test';
import { deserialize, serialize, Field } from '../../index';
import { isString, isNumber } from '../../src/rules/index';
import { unseal } from './helpers/unseal';

// ─── DTOs ────────────────────────────────────────────────────────────────────

class AdminDto {
  @Field(isString)
  name!: string;

  @Field(isString, { groups: ['admin'] })
  internalCode?: string;
}

class GroupedSerialDto {
  @Field(isString)
  name!: string;

  @Field(isNumber(), { groups: ['public'] })
  score?: number;
}

// ─────────────────────────────────────────────────────────────────────────────

afterEach(() => unseal());

describe('groups — integration', () => {
  it('should deserialize group-gated field when group is provided', async () => {
    const result = await deserialize<AdminDto>(AdminDto, { name: 'Alice', internalCode: 'XYZ' }, { groups: ['admin'] }) as AdminDto;
    expect(result.name).toBe('Alice');
    expect(result.internalCode).toBe('XYZ');
  });

  it('should skip group-gated field when group is NOT provided', async () => {
    const result = await deserialize<AdminDto>(AdminDto, { name: 'Alice', internalCode: 'XYZ' }) as AdminDto;
    expect(result.name).toBe('Alice');
    // internalCode is group-gated — not processed without group
    expect(result.internalCode).toBeUndefined();
  });

  it('should skip group-gated field when wrong group provided', async () => {
    const result = await deserialize<AdminDto>(AdminDto, { name: 'Bob', internalCode: 'ABC' }, { groups: ['user'] }) as AdminDto;
    expect(result.internalCode).toBeUndefined();
  });

  it('should serialize group-gated field when group matches', async () => {
    const dto = Object.assign(new GroupedSerialDto(), { name: 'Carol', score: 99 });
    const result = await serialize(dto, { groups: ['public'] });
    expect(result['score']).toBe(99);
  });

  it('should omit group-gated field during serialize when no group provided', async () => {
    const dto = Object.assign(new GroupedSerialDto(), { name: 'Dave', score: 85 });
    const result = await serialize(dto);
    expect(result['score']).toBeUndefined();
  });
});
