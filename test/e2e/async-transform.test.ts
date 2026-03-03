import { describe, it, expect, afterEach } from 'bun:test';
import { seal, deserialize, serialize, IsString, IsNumber, Transform } from '../../index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class AsyncTrimDto {
  @Transform(async ({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  name!: string;
}

class AsyncSerializeDto {
  @Transform(async ({ value }) => `[${value}]`, { serializeOnly: true })
  @IsString()
  tag!: string;
}

class AsyncChainDto {
  @Transform(async ({ value }) => typeof value === 'string' ? value.trim() : value)
  @Transform(async ({ value }) => typeof value === 'string' ? value.toUpperCase() : value)
  @IsString()
  code!: string;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('async @Transform — deserialize', () => {
  it('async trim → 결과 반환', async () => {
    seal();
    const result = await deserialize<AsyncTrimDto>(AsyncTrimDto, { name: '  Alice  ' });
    expect(result.name).toBe('Alice');
  });

  it('async 체이닝 (trim → toUpperCase)', async () => {
    seal();
    const result = await deserialize<AsyncChainDto>(AsyncChainDto, { code: '  hello  ' });
    expect(result.code).toBe('HELLO');
  });
});

describe('async @Transform — serialize', () => {
  it('async serializeOnly → serialize에서 적용', async () => {
    seal();
    const dto = Object.assign(new AsyncSerializeDto(), { tag: 'world' });
    const result = await serialize(dto);
    expect(result['tag']).toBe('[world]');
  });
});
