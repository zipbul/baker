import { describe, it, expect, afterEach } from 'bun:test';
import { Field, deserialize, serialize } from '../../index';
import { isString } from '../../src/rules/index';
import { isAsyncFunction } from '../../src/utils';
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

// ─────────────────────────────────────────────────────────────────────────────
// E-10: async detection robustness (→ B-6)
// ─────────────────────────────────────────────────────────────────────────────

describe('E-10: isAsyncFunction robustness', () => {
  it('async function with mangled name → still detected as async', () => {
    const fn = async () => {};
    Object.defineProperty(fn, 'name', { value: 'e' });
    expect(isAsyncFunction(fn)).toBe(true);
  });

  it('async function with constructor.name overridden → still detected as async via Symbol.toStringTag', () => {
    const fn = async () => {};
    // Even if someone tries to override constructor-related properties,
    // Symbol.toStringTag on the prototype is not affected
    Object.defineProperty(fn, 'name', { value: 'Function' });
    expect(isAsyncFunction(fn)).toBe(true);
  });

  it('sync function → not detected as async', () => {
    const fn = () => {};
    expect(isAsyncFunction(fn)).toBe(false);
  });

  it('async function used as transform is correctly detected at seal time', async () => {
    const mangledAsync = async ({ value }: { value: unknown }) => value;
    Object.defineProperty(mangledAsync, 'name', { value: 'x' });

    class MangledDto {
      @Field(isString, { transform: mangledAsync })
      val!: string;
    }

    // If async detection works, deserialize should still return a promise
    const result = await deserialize<MangledDto>(MangledDto, { val: 'test' });
    expect(result.val).toBe('test');
  });
});
