import { describe, it, expect, afterEach } from 'bun:test';
import { Field, deserialize, serialize } from '../../index';
import { isString } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class AsyncTrimDto {
  @Field(isString, {
    transform: async ({ value }) => typeof value === 'string' ? value.trim() : value,
  })
  name!: string;
}

class AsyncSerializeDto {
  @Field(isString, {
    transform: async ({ value, direction }) =>
      direction === 'serialize' ? `[${value}]` : value,
  })
  tag!: string;
}

class AsyncChainDto {
  @Field(isString, {
    transform: async ({ value }) => {
      let v = value;
      if (typeof v === 'string') v = v.trim();
      if (typeof v === 'string') v = v.toUpperCase();
      return v;
    },
  })
  code!: string;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('async @Transform — deserialize', () => {
  it('async trim → 결과 반환', async () => {
    const result = await deserialize<AsyncTrimDto>(AsyncTrimDto, { name: '  Alice  ' });
    expect(result.name).toBe('Alice');
  });

  it('async 체이닝 (trim → toUpperCase)', async () => {
    const result = await deserialize<AsyncChainDto>(AsyncChainDto, { code: '  hello  ' });
    expect(result.code).toBe('HELLO');
  });
});

describe('async @Transform — serialize', () => {
  it('async serializeOnly → serialize에서 적용', async () => {
    const dto = Object.assign(new AsyncSerializeDto(), { tag: 'world' });
    const result = await serialize(dto);
    expect(result['tag']).toBe('[world]');
  });
});
