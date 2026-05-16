import { describe, it, expect, afterEach, beforeEach } from 'bun:test';

import { Field, deserialize, serialize, seal } from '../../index';
import { isString, isNumber } from '../../src/rules/index';
import { SEALED } from '../../src/symbols';
import { isAsyncFunction } from '../../src/utils';
import { unseal } from '../integration/helpers/unseal';

beforeEach(() => seal());
afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class AsyncTrimDto {
  @Field(isString, {
    transform: {
      deserialize: async ({ value }) => (typeof value === 'string' ? value.trim() : value),
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
        if (typeof v === 'string') {v = v.trim();}
        if (typeof v === 'string') {v = v.toUpperCase();}
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
    const result = (await deserialize<AsyncTrimDto>(AsyncTrimDto, { name: '  Alice  ' })) as AsyncTrimDto;
    expect(result.name).toBe('Alice');
  });

  it('async chaining (trim → toUpperCase)', async () => {
    const result = (await deserialize<AsyncChainDto>(AsyncChainDto, { code: '  hello  ' })) as AsyncChainDto;
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
    seal(PromiseDeserializeDto);

    expect(() => deserialize<PromiseDeserializeDto>(PromiseDeserializeDto, { name: '  Alice  ' })).toThrow(
      'deserialize transform returned Promise',
    );
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
    seal(PromiseSerializeDto);

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
    seal(MangledDto);

    // If async detection works, deserialize should still return a promise
    const result = (await deserialize<MangledDto>(MangledDto, { val: 'test' })) as MangledDto;
    expect(result.val).toBe('test');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// analyzeAsync — Set/Map value DTO async propagates to parent
// Parent has only sync own fields; Set/Map value DTO is async → parent must be async.
// ─────────────────────────────────────────────────────────────────────────────

describe('analyzeAsync — Set/Map value DTO async propagates to parent', () => {
  it('Set<AsyncDeserItem> makes parent isAsync true', () => {
    class AsyncDeserItem {
      @Field(isString, {
        transform: { deserialize: async ({ value }) => value, serialize: ({ value }) => value },
      })
      v!: string;
    }
    class ParentSet {
      @Field({ type: () => Set as any, setValue: () => AsyncDeserItem })
      items!: Set<AsyncDeserItem>;
    }
    unseal();
    seal();
    expect((ParentSet as any)[SEALED].isAsync).toBe(true);
  });

  it('Map<string, AsyncDeserVal> makes parent isAsync true', () => {
    class AsyncDeserVal {
      @Field(isString, {
        transform: { deserialize: async ({ value }) => value, serialize: ({ value }) => value },
      })
      v!: string;
    }
    class ParentMap {
      @Field({ type: () => Map as any, setValue: () => AsyncDeserVal })
      entries!: Map<string, AsyncDeserVal>;
    }
    unseal();
    seal();
    expect((ParentMap as any)[SEALED].isAsync).toBe(true);
  });

  it('Set<AsyncSerItem> makes parent isSerializeAsync true', () => {
    class AsyncSerItem {
      @Field(isNumber(), {
        transform: { deserialize: ({ value }) => value, serialize: async ({ value }) => value },
      })
      score!: number;
    }
    class ParentSerSet {
      @Field({ type: () => Set as any, setValue: () => AsyncSerItem })
      items!: Set<AsyncSerItem>;
    }
    unseal();
    seal();
    expect((ParentSerSet as any)[SEALED].isSerializeAsync).toBe(true);
  });

  it('Map<string, AsyncSerVal> makes parent isSerializeAsync true', () => {
    class AsyncSerVal {
      @Field(isNumber(), {
        transform: { deserialize: ({ value }) => value, serialize: async ({ value }) => value },
      })
      n!: number;
    }
    class ParentSerMap {
      @Field({ type: () => Map as any, setValue: () => AsyncSerVal })
      entries!: Map<string, AsyncSerVal>;
    }
    unseal();
    seal();
    expect((ParentSerMap as any)[SEALED].isSerializeAsync).toBe(true);
  });

  it('async Set<DTO> deserialize returns Promise and resolves correctly', async () => {
    class AsyncItem2 {
      @Field(isString, {
        transform: { deserialize: async ({ value }) => String(value).toUpperCase(), serialize: ({ value }) => value },
      })
      v!: string;
    }
    class ParentDe {
      @Field({ type: () => Set as any, setValue: () => AsyncItem2 })
      items!: Set<AsyncItem2>;
    }
    unseal();
    seal();
    const result = (await deserialize<ParentDe>(ParentDe, { items: [{ v: 'a' }, { v: 'b' }] })) as ParentDe;
    expect(result.items).toBeInstanceOf(Set);
    const values = [...result.items].map(x => x.v).sort();
    expect(values).toEqual(['A', 'B']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// coverage-gaps origin: async serialize Set<DTO>, array of nested DTOs
// ─────────────────────────────────────────────────────────────────────────────

describe('async serialize Set<DTO>', () => {
  class SetItemDto {
    @Field(isString) name!: string;
  }
  class AsyncSerSetDto {
    @Field({ type: () => Set as any, setValue: () => SetItemDto })
    items!: Set<SetItemDto>;
    @Field(isString, {
      transform: { deserialize: async ({ value }) => value, serialize: ({ value }) => value },
    })
    other!: string;
  }

  it('serializes Set<DTO> when DTO has async transform on another field', async () => {
    const dto = (await deserialize(AsyncSerSetDto, {
      items: [{ name: 'hello' }, { name: 'world' }],
      other: 'test',
    })) as AsyncSerSetDto;
    expect(dto.items).toBeInstanceOf(Set);
    const result = await serialize(dto);
    expect(Array.isArray(result.items)).toBe(true);
    expect((result.items as any[]).length).toBe(2);
  });
});

describe('async serialize array of nested DTOs', () => {
  class ItemDto {
    @Field(isString) name!: string;
  }
  class AsyncArrayDto {
    @Field({ type: () => [ItemDto] })
    items!: ItemDto[];
    @Field(isString, { transform: { deserialize: async ({ value }) => value, serialize: ({ value }) => value } })
    tag!: string;
  }

  it('serializes array of nested DTOs in async context', async () => {
    const dto = (await deserialize(AsyncArrayDto, {
      items: [{ name: 'a' }, { name: 'b' }],
      tag: 'test',
    })) as AsyncArrayDto;
    const result = await serialize(dto);
    expect(Array.isArray(result.items)).toBe(true);
    expect((result.items as any[]).length).toBe(2);
  });
});
