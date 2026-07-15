import { describe, it, expect, afterEach, beforeEach } from 'bun:test';

import { Baker, Field } from '../../index';
import { isAsyncFunction } from '../../src/common/utils';
import { isString, isNumber } from '../../src/rules/index';
import { sealClass } from '../integration/helpers/seal';
import { unseal } from '../integration/helpers/unseal';

const baker = new Baker();

beforeEach(() => baker.seal());
afterEach(() => unseal());

const trimIfString = ({ value }: { value: unknown }): unknown => {
  if (typeof value === 'string') {
    return value.trim();
  }
  return value;
};
const promiseTrimIfString = ({ value }: { value: unknown }): Promise<unknown> => Promise.resolve(trimIfString({ value }));
const passthrough = ({ value }: { value: unknown }): unknown => value;

// ─────────────────────────────────────────────────────────────────────────────

@baker.Recipe
class AsyncTrimDto {
  @Field(isString, {
    transform: {
      deserialize: async ({ value }) => (typeof value === 'string' ? value.trim() : value),
      serialize: ({ value }) => value,
    },
  })
  name!: string;
}

@baker.Recipe
class AsyncSerializeDto {
  @Field(isString, {
    transform: {
      deserialize: ({ value }) => value,
      serialize: async ({ value }) => `[${value}]`,
    },
  })
  tag!: string;
}

@baker.Recipe
class AsyncChainDto {
  @Field(isString, {
    transform: {
      deserialize: async ({ value }) => {
        let v = value;
        if (typeof v === 'string') {
          v = v.trim();
        }
        if (typeof v === 'string') {
          v = v.toUpperCase();
        }
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
    const result = (await baker.deserialize<AsyncTrimDto>(AsyncTrimDto, { name: '  Alice  ' })) as AsyncTrimDto;
    expect(result.name).toBe('Alice');
  });

  it('async chaining (trim → toUpperCase)', async () => {
    const result = (await baker.deserialize<AsyncChainDto>(AsyncChainDto, { code: '  hello  ' })) as AsyncChainDto;
    expect(result.code).toBe('HELLO');
  });

  it('promise-returning non-async deserialize transform throws contract error', () => {
    class PromiseDeserializeDto {
      @Field(isString, {
        transform: {
          deserialize: promiseTrimIfString,
          serialize: passthrough,
        },
      })
      name!: string;
    }
    const promiseDeserializeBaker = sealClass(PromiseDeserializeDto);

    expect(() =>
      promiseDeserializeBaker.deserialize<PromiseDeserializeDto>(PromiseDeserializeDto, { name: '  Alice  ' }),
    ).toThrow('deserialize transform returned Promise');
  });

  it('promise-returning non-async deserialize transform throws at chain position 2 (mid-chain)', () => {
    // Two-transform chain — deserialize executes in declaration order, so the second declared
    // transform is also the second one called. The guard must fire there too, not just on a
    // single-transform field.
    class PromiseDeserializeChainDto {
      @Field(isString, {
        transform: [
          { deserialize: passthrough, serialize: passthrough },
          { deserialize: promiseTrimIfString, serialize: passthrough },
        ],
      })
      name!: string;
    }
    const promiseDeserializeChainBaker = sealClass(PromiseDeserializeChainDto);

    expect(() =>
      promiseDeserializeChainBaker.deserialize<PromiseDeserializeChainDto>(PromiseDeserializeChainDto, { name: '  Alice  ' }),
    ).toThrow('deserialize transform returned Promise');
  });
});

describe('async @Transform — serialize', () => {
  it('async serializeOnly → applied on serialize', async () => {
    const dto = Object.assign(new AsyncSerializeDto(), { tag: 'world' });
    const result = await baker.serialize(dto);
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
    const promiseSerializeBaker = sealClass(PromiseSerializeDto);

    const dto = Object.assign(new PromiseSerializeDto(), { tag: 'world' });
    expect(() => promiseSerializeBaker.serialize(dto)).toThrow('serialize transform returned Promise');
  });

  it('promise-returning non-async serialize transform throws at chain position 2 (mid-chain)', () => {
    // Two-transform chain — serialize executes in REVERSE declaration order, so the transform
    // declared first is the second one called. The guard must fire there too, not just on the
    // last-declared (first-called) transform.
    class PromiseSerializeChainDto {
      @Field(isString, {
        transform: [
          { deserialize: passthrough, serialize: ({ value }) => Promise.resolve(`[${value}]`) },
          { deserialize: passthrough, serialize: passthrough },
        ],
      })
      tag!: string;
    }
    const promiseSerializeChainBaker = sealClass(PromiseSerializeChainDto);

    const dto = Object.assign(new PromiseSerializeChainDto(), { tag: 'world' });
    expect(() => promiseSerializeChainBaker.serialize(dto)).toThrow('serialize transform returned Promise');
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
    const mangledBaker = sealClass(MangledDto);

    // If async detection works, deserialize should still return a promise
    const result = (await mangledBaker.deserialize<MangledDto>(MangledDto, { val: 'test' })) as MangledDto;
    expect(result.val).toBe('test');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// analyzeAsync — Set/Map value DTO async propagates to parent
// Parent has only sync own fields; Set/Map value DTO is async → parent must be async.
// ─────────────────────────────────────────────────────────────────────────────

describe('analyzeAsync — Set/Map value DTO async propagates to parent', () => {
  it('Set<AsyncDeserItem> makes parent isAsync true', () => {
    const b = new Baker();
    @b.Recipe
    class AsyncDeserItem {
      @Field(isString, {
        transform: { deserialize: async ({ value }) => value, serialize: ({ value }) => value },
      })
      v!: string;
    }
    @b.Recipe
    class ParentSet {
      @Field({ type: () => Set, setValue: () => AsyncDeserItem })
      items!: Set<AsyncDeserItem>;
    }
    b.seal();
    expect(b.deserialize<ParentSet>(ParentSet, { items: [{ v: 'a' }] })).toBeInstanceOf(Promise);
  });

  it('Map<string, AsyncDeserVal> makes parent isAsync true', () => {
    const b = new Baker();
    @b.Recipe
    class AsyncDeserVal {
      @Field(isString, {
        transform: { deserialize: async ({ value }) => value, serialize: ({ value }) => value },
      })
      v!: string;
    }
    @b.Recipe
    class ParentMap {
      @Field({ type: () => Map, setValue: () => AsyncDeserVal })
      entries!: Map<string, AsyncDeserVal>;
    }
    b.seal();
    expect(b.deserialize<ParentMap>(ParentMap, { entries: { k: { v: 'a' } } })).toBeInstanceOf(Promise);
  });

  it('Set<AsyncSerItem> makes parent isSerializeAsync true', () => {
    const b = new Baker();
    @b.Recipe
    class AsyncSerItem {
      @Field(isNumber(), {
        transform: { deserialize: ({ value }) => value, serialize: async ({ value }) => value },
      })
      score!: number;
    }
    @b.Recipe
    class ParentSerSet {
      @Field({ type: () => Set, setValue: () => AsyncSerItem })
      items!: Set<AsyncSerItem>;
    }
    b.seal();
    const instance = Object.assign(new ParentSerSet(), {
      items: new Set([Object.assign(new AsyncSerItem(), { score: 1 })]),
    });
    expect(b.serialize(instance)).toBeInstanceOf(Promise);
  });

  it('Map<string, AsyncSerVal> makes parent isSerializeAsync true', () => {
    const b = new Baker();
    @b.Recipe
    class AsyncSerVal {
      @Field(isNumber(), {
        transform: { deserialize: ({ value }) => value, serialize: async ({ value }) => value },
      })
      n!: number;
    }
    @b.Recipe
    class ParentSerMap {
      @Field({ type: () => Map, setValue: () => AsyncSerVal })
      entries!: Map<string, AsyncSerVal>;
    }
    b.seal();
    const instance = Object.assign(new ParentSerMap(), {
      entries: new Map([['k', Object.assign(new AsyncSerVal(), { n: 1 })]]),
    });
    expect(b.serialize(instance)).toBeInstanceOf(Promise);
  });

  it('async Set<DTO> deserialize returns Promise and resolves correctly', async () => {
    const b = new Baker();
    @b.Recipe
    class AsyncItem2 {
      @Field(isString, {
        transform: { deserialize: async ({ value }) => String(value).toUpperCase(), serialize: ({ value }) => value },
      })
      v!: string;
    }
    @b.Recipe
    class ParentDe {
      @Field({ type: () => Set, setValue: () => AsyncItem2 })
      items!: Set<AsyncItem2>;
    }
    b.seal();
    const result = (await b.deserialize<ParentDe>(ParentDe, { items: [{ v: 'a' }, { v: 'b' }] })) as ParentDe;
    expect(result.items).toBeInstanceOf(Set);
    const values = [...result.items].map(x => x.v).sort();
    expect(values).toEqual(['A', 'B']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// coverage-gaps origin: async serialize Set<DTO>, array of nested DTOs
// ─────────────────────────────────────────────────────────────────────────────

describe('async serialize Set<DTO>', () => {
  @baker.Recipe
  class SetItemDto {
    @Field(isString) name!: string;
  }
  @baker.Recipe
  class AsyncSerSetDto {
    @Field({ type: () => Set, setValue: () => SetItemDto })
    items!: Set<SetItemDto>;
    @Field(isString, {
      transform: { deserialize: async ({ value }) => value, serialize: ({ value }) => value },
    })
    other!: string;
  }

  it('serializes Set<DTO> when DTO has async transform on another field', async () => {
    const dto = (await baker.deserialize(AsyncSerSetDto, {
      items: [{ name: 'hello' }, { name: 'world' }],
      other: 'test',
    })) as AsyncSerSetDto;
    expect(dto.items).toBeInstanceOf(Set);
    const result = await baker.serialize(dto);
    expect(Array.isArray(result.items)).toBe(true);
    expect((result.items as unknown[]).length).toBe(2);
  });
});

describe('async serialize array of nested DTOs', () => {
  @baker.Recipe
  class ItemDto {
    @Field(isString) name!: string;
  }
  @baker.Recipe
  class AsyncArrayDto {
    @Field({ type: () => [ItemDto] })
    items!: ItemDto[];
    @Field(isString, { transform: { deserialize: async ({ value }) => value, serialize: ({ value }) => value } })
    tag!: string;
  }

  it('serializes array of nested DTOs in async context', async () => {
    const dto = (await baker.deserialize(AsyncArrayDto, {
      items: [{ name: 'a' }, { name: 'b' }],
      tag: 'test',
    })) as AsyncArrayDto;
    const result = await baker.serialize(dto);
    expect(Array.isArray(result.items)).toBe(true);
    expect((result.items as unknown[]).length).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Async propagation through nesting depth + cycles (regression: 3-level crash & circular drop)
// ─────────────────────────────────────────────────────────────────────────────

const asyncUpper = {
  deserialize: async ({ value }: { value: unknown }) => `A_${String(value)}`,
  serialize: ({ value }: { value: unknown }) => value,
};

@baker.Recipe
class DeepLeaf {
  @Field(isString, { transform: asyncUpper }) v!: string;
}
@baker.Recipe
class DeepMid {
  @Field({ type: () => DeepLeaf }) c!: DeepLeaf;
}
@baker.Recipe
class DeepRoot {
  @Field({ type: () => DeepMid }) b!: DeepMid;
}

@baker.Recipe
class CycA {
  @Field(isString, { transform: asyncUpper }) v!: string;
  @Field({ optional: true, type: () => CycB }) b?: CycB;
}
@baker.Recipe
class CycB {
  @Field(isString) w!: string;
  @Field({ optional: true, type: () => CycA }) a?: CycA;
}

// 3-cycle Tri1 → Tri2 → Tri3 → Tri1 with async only on the non-adjacent Tri2.
@baker.Recipe
class Tri1 {
  @Field({ optional: true, type: () => Tri2 }) next?: Tri2;
  @Field(isString) id!: string;
}
@baker.Recipe
class Tri2 {
  @Field(isString, { transform: asyncUpper }) v!: string;
  @Field({ optional: true, type: () => Tri3 }) next?: Tri3;
}
@baker.Recipe
class Tri3 {
  @Field({ optional: true, type: () => Tri1 }) next?: Tri1;
  @Field(isString) id!: string;
}

describe('async — propagation through depth and cycles', () => {
  it('3-level nested async DTO makes the root async and round-trips (no sync-with-await crash)', async () => {
    expect(baker.deserialize(DeepRoot, { b: { c: { v: 'z' } } })).toBeInstanceOf(Promise);
    const out = (await baker.deserialize(DeepRoot, { b: { c: { v: 'z' } } })) as DeepRoot;
    expect(out.b.c.v).toBe('A_z');
  });

  it('circular reference propagates async to the class on the back-edge', async () => {
    // CycB has no async of its own but references CycA (async). The cycle must not hide that.
    expect(baker.deserialize(CycA, { v: 'x' })).toBeInstanceOf(Promise);
    expect(baker.deserialize(CycB, { w: 'y', a: { v: 'x' } })).toBeInstanceOf(Promise);
    const out = (await baker.deserialize(CycB, { w: 'y', a: { v: 'x' } })) as CycB;
    expect(out.a?.v).toBe('A_x');
  });

  it('3-cycle propagates async from a non-adjacent member to every class on the cycle', async () => {
    // Async lives only on Tri2; entering at Tri1/Tri3 reaches it only by traversing the cycle.
    expect(baker.deserialize(Tri1, { id: 't1' })).toBeInstanceOf(Promise);
    expect(baker.deserialize(Tri2, { v: 'bb' })).toBeInstanceOf(Promise);
    expect(baker.deserialize(Tri3, { id: 't3' })).toBeInstanceOf(Promise);
    const out = (await baker.deserialize(Tri3, { id: 't3', next: { id: 't1', next: { v: 'bb' } } })) as Tri3;
    expect(out.next?.next?.v).toBe('A_bb');
  });
});
