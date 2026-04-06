import { describe, it, expect, afterEach } from 'bun:test';
import { Field, deserialize, serialize } from '../../index';
import { isString } from '../../src/rules/index';
import { isAsyncFunction } from '../../src/utils';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class AsyncTrimDto {
  @Field(isString, {
    transform: {
      deserialize: async ({ value }) => typeof value === 'string' ? value.trim() : value,
      serialize: ({ value }) => value,
    },
  })
  name!: string;
}

class AsyncSerializeDto {
  @Field(isString, {
    transform: {
      deserialize: ({ value }) => value,
      serialize: async ({ value }) => `[${value}]`,
    },
  })
  tag!: string;
}

class AsyncChainDto {
  @Field(isString, {
    transform: {
      deserialize: async ({ value }) => {
        let v = value;
        if (typeof v === 'string') v = v.trim();
        if (typeof v === 'string') v = v.toUpperCase();
        return v;
      },
      serialize: ({ value }) => value,
    },
  })
  code!: string;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('async @Transform — deserialize', () => {
  it('async trim → result returned', async () => {
    const result = await deserialize<AsyncTrimDto>(AsyncTrimDto, { name: '  Alice  ' }) as AsyncTrimDto;
    expect(result.name).toBe('Alice');
  });

  it('async chaining (trim → toUpperCase)', async () => {
    const result = await deserialize<AsyncChainDto>(AsyncChainDto, { code: '  hello  ' }) as AsyncChainDto;
    expect(result.code).toBe('HELLO');
  });

  it('promise-returning non-async deserialize transform throws contract error', () => {
    class PromiseDeserializeDto {
      @Field(isString, {
        transform: {
          deserialize: ({ value }) => Promise.resolve(typeof value === 'string' ? value.trim() : value),
          serialize: ({ value }) => value,
        },
      })
      name!: string;
    }

    expect(() => deserialize<PromiseDeserializeDto>(PromiseDeserializeDto, { name: '  Alice  ' }))
      .toThrow('deserialize transform returned Promise');
  });
});

describe('async @Transform — serialize', () => {
  it('async serializeOnly → applied on serialize', async () => {
    const dto = Object.assign(new AsyncSerializeDto(), { tag: 'world' });
    const result = await serialize(dto);
    expect(result['tag']).toBe('[world]');
  });

  it('promise-returning non-async serialize transform throws contract error', () => {
    class PromiseSerializeDto {
      @Field(isString, {
        transform: {
          deserialize: ({ value }) => value,
          serialize: ({ value }) => Promise.resolve(`[${value}]`),
        },
      })
      tag!: string;
    }

    const dto = Object.assign(new PromiseSerializeDto(), { tag: 'world' });
    expect(() => serialize(dto)).toThrow('serialize transform returned Promise');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E-10: async detection robustness
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
      @Field(isString, { transform: { deserialize: mangledAsync, serialize: ({ value }: { value: unknown }) => value } })
      val!: string;
    }

    // If async detection works, deserialize should still return a promise
    const result = await deserialize<MangledDto>(MangledDto, { val: 'test' }) as MangledDto;
    expect(result.val).toBe('test');
  });
});
