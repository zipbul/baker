import { describe, it, expect, afterEach, beforeEach } from 'bun:test';

import { Field, deserialize, serialize, createRule, configure, isBakerError, SealError, seal } from '../../index';
import { isString, isNumber, isEmail, min } from '../../src/rules/index';
import { SEALED, RAW } from '../../src/symbols';
import { unseal, purgePoisonClasses } from './helpers/unseal';

// ─── DTOs ────────────────────────────────────────────────────────────────────

class SealTestDto {
  @Field(isString)
  name!: string;

  @Field(isNumber())
  age!: number;
}

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => seal());
afterEach(() => unseal());

describe('seal() — explicit seal at startup', () => {
  it('seal() attaches SEALED executors', () => {
    const sealed = (SealTestDto as any)[SEALED];
    expect(sealed).toBeDefined();
    expect(typeof sealed._deserialize).toBe('function');
    expect(typeof sealed._serialize).toBe('function');
  });

  it('deserialize works after explicit seal()', async () => {
    const r = await deserialize(SealTestDto, { name: 'Alice', age: 25 });
    expect(isBakerError(r)).toBe(false);
  });

  it('serialize works after explicit seal()', async () => {
    const dto = Object.assign(new SealTestDto(), { name: 'Bob', age: 30 });
    const r = await serialize(dto);
    expect(r).toEqual({ name: 'Bob', age: 30 });
  });

  it('seal() is idempotent — calling again is a no-op', () => {
    expect(() => seal()).not.toThrow();
    expect(() => seal()).not.toThrow();
    expect((SealTestDto as any)[SEALED]).toBeDefined();
  });

  it('unseal() removes SEALED executors', () => {
    expect((SealTestDto as any)[SEALED]).toBeDefined();
    unseal();
    expect((SealTestDto as any)[SEALED]).toBeUndefined();
  });

  it('seal() after unseal() re-seals', () => {
    unseal();
    expect((SealTestDto as any)[SEALED]).toBeUndefined();
    seal();
    expect((SealTestDto as any)[SEALED]).toBeDefined();
  });
});

describe('seal() — error when not sealed', () => {
  it('deserialize throws SealError when class is not sealed', () => {
    unseal();
    expect(() => deserialize(SealTestDto, { name: 'x', age: 1 })).toThrow(SealError);
  });

  it('serialize throws SealError when class is not sealed', () => {
    unseal();
    const dto = Object.assign(new SealTestDto(), { name: 'x', age: 1 });
    expect(() => serialize(dto)).toThrow(SealError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C1: async architecture — _isAsync / _isSerializeAsync flags
// ─────────────────────────────────────────────────────────────────────────────

class SyncDto {
  @Field(isString)
  name!: string;
}

class AsyncTransformDeserializeDto {
  @Field(isString, {
    transform: {
      deserialize: async ({ value }) => (typeof value === 'string' ? value.trim() : value),
      serialize: ({ value }) => value,
    },
  })
  name!: string;
}

const asyncRule = createRule({
  name: 'asyncCustom',
  validate: async v => typeof v === 'string',
});

class AsyncRuleDto {
  @Field({ rules: [asyncRule] })
  name!: string;
}

class AsyncTransformSerializeDto {
  @Field(isNumber(), {
    transform: {
      deserialize: ({ value }) => value,
      serialize: async ({ value }) => (typeof value === 'number' ? value * 100 : value),
    },
  })
  price!: number;
}

class ParentWithAsyncNestedDto {
  @Field({ type: () => AsyncTransformDeserializeDto })
  child!: AsyncTransformDeserializeDto;
}

describe('C1 — async architecture (_isAsync / _isSerializeAsync)', () => {
  it('sync DTO → _isAsync === false', () => {
    const sealed = (SyncDto as any)[SEALED];
    expect(sealed._isAsync).toBe(false);
  });

  it('async @Transform (deserialize) → _isAsync === true', () => {
    const sealed = (AsyncTransformDeserializeDto as any)[SEALED];
    expect(sealed._isAsync).toBe(true);
  });

  it('async createRule → _isAsync === true', () => {
    const sealed = (AsyncRuleDto as any)[SEALED];
    expect(sealed._isAsync).toBe(true);
  });

  it('nested async DTO → parent _isAsync === true', () => {
    const sealed = (ParentWithAsyncNestedDto as any)[SEALED];
    expect(sealed._isAsync).toBe(true);
  });

  it('async @Transform (serializeOnly) → _isSerializeAsync === true', () => {
    const sealed = (AsyncTransformSerializeDto as any)[SEALED];
    expect(sealed._isSerializeAsync).toBe(true);
  });

  it('sync DTO → _isSerializeAsync === false', () => {
    const sealed = (SyncDto as any)[SEALED];
    expect(sealed._isSerializeAsync).toBe(false);
  });

  it('deserialize-only async transform keeps _isSerializeAsync false', () => {
    const sealed = (AsyncTransformDeserializeDto as any)[SEALED];
    expect(sealed._isSerializeAsync).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// seal(Class) — on-demand seal for late-registered classes
// ─────────────────────────────────────────────────────────────────────────────

describe('seal(Class) — on-demand', () => {
  it('seal(LateDto) seals a late-registered class', async () => {
    class LateDto {}
    (LateDto as any)[RAW] = {
      value: {
        validation: [{ rule: isString }],
        transform: [],
        expose: [],
        exclude: null,
        type: null,
        flags: {},
        schema: null,
      },
    };

    seal(LateDto);
    expect((LateDto as any)[SEALED]).toBeDefined();

    const instance = Object.assign(new LateDto(), { value: 'hello' });
    const result = await serialize(instance);
    expect(result).toEqual({ value: 'hello' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E-25: concurrent seal via Promise.all
// ─────────────────────────────────────────────────────────────────────────────

describe('E-25: concurrent deserialize on pre-sealed classes', () => {
  class ConcurrentA {
    @Field(isString)
    a!: string;
  }

  class ConcurrentB {
    @Field(isNumber())
    b!: number;
  }

  class ConcurrentC {
    @Field(isString)
    c!: string;

    @Field(isNumber())
    d!: number;
  }

  it('3 DTO classes deserialized concurrently via Promise.all → all succeed', async () => {
    const [a, b, c] = (await Promise.all([
      deserialize<ConcurrentA>(ConcurrentA, { a: 'hello' }),
      deserialize<ConcurrentB>(ConcurrentB, { b: 42 }),
      deserialize<ConcurrentC>(ConcurrentC, { c: 'world', d: 99 }),
    ])) as [ConcurrentA, ConcurrentB, ConcurrentC];
    expect(a).toBeInstanceOf(ConcurrentA);
    expect(a.a).toBe('hello');
    expect(b).toBeInstanceOf(ConcurrentB);
    expect(b.b).toBe(42);
    expect(c).toBeInstanceOf(ConcurrentC);
    expect(c.c).toBe('world');
    expect(c.d).toBe(99);
  });

  it('all classes are sealed via beforeEach seal()', () => {
    expect((ConcurrentA as any)[SEALED]).toBeDefined();
    expect((ConcurrentB as any)[SEALED]).toBeDefined();
    expect((ConcurrentC as any)[SEALED]).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// configure() rejects post-seal misuse
// ─────────────────────────────────────────────────────────────────────────────

describe('configure() — post-seal misuse', () => {
  it('should not throw when called before seal', () => {
    unseal();
    expect(() => configure({})).not.toThrow();
  });

  it('should throw SealError when called after seal', () => {
    expect(() => configure({ autoConvert: true })).toThrow(SealError);
    expect(() => configure({ autoConvert: true })).toThrow('called after seal()');
  });

  it('should allow configure() again after unseal', () => {
    unseal();
    expect(() => configure({})).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E-15: partial seal + reconfigure — unseal, change config, re-seal verifies effect
// ─────────────────────────────────────────────────────────────────────────────

describe('E-15: partial seal + reconfigure takes effect after unseal', () => {
  it('should apply new forbidUnknown config after unseal + reconfigure', async () => {
    const r1 = (await deserialize<any>(SealTestDto, { name: 'Alice', age: 25, extra: 'ok' })) as any;
    expect(r1.name).toBe('Alice');

    unseal();
    configure({ forbidUnknown: true });
    seal();

    const result = await deserialize(SealTestDto, { name: 'Bob', age: 30, extra: 'bad' });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      const err = result.errors.find((x: any) => x.code === 'whitelistViolation');
      expect(err).toBeDefined();
    }
  });

  it('should remove forbidUnknown effect after unseal + reconfigure without it', async () => {
    unseal();
    configure({ forbidUnknown: true });
    seal();
    const result1 = await deserialize(SealTestDto, { name: 'Alice', age: 25, extra: 'bad' });
    expect(isBakerError(result1)).toBe(true);

    unseal();
    configure({});
    seal();

    const result = (await deserialize<any>(SealTestDto, { name: 'Bob', age: 30, extra: 'ok' })) as any;
    expect(result.name).toBe('Bob');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// seal failure paths — transactional cleanup
// ─────────────────────────────────────────────────────────────────────────────

describe('seal() — transactional failure cleanup', () => {
  afterEach(() => {
    purgePoisonClasses();
    unseal();
  });

  it('nested setValue thunk thrown during analyzeCircular wraps in SealError', () => {
    class NestedBad {
      @Field({
        type: () => Set as any,
        setValue: () => {
          throw new Error('nested-boom');
        },
      })
      items!: Set<unknown>;
    }
    class ParentRef {
      @Field({ type: () => NestedBad })
      child!: NestedBad;
    }
    expect(() => seal(ParentRef)).toThrow(/nested-boom/);
  });

  it('failed nested seal cleans up both parent and nested placeholders', () => {
    // Nested has conflicting requiresType — fails inside buildDeserializeCode
    // AFTER placeholder is installed. Parent's recursive sealOne(Nested) propagates
    // the throw; cleanup loop must delete BOTH placeholders.
    class NestedConflict {
      @Field(isEmail(), min(5)) v!: unknown;
    }
    class ParentWrap {
      @Field({ type: () => NestedConflict }) child!: NestedConflict;
    }
    expect(() => seal(ParentWrap)).toThrow(/conflicting requiresType/);
    expect((ParentWrap as any)[SEALED]).toBeUndefined();
    expect((NestedConflict as any)[SEALED]).toBeUndefined();
  });

  it('seal(Class) with throwing @Type thunk leaves no SEALED placeholder', () => {
    class BadType {
      @Field({
        type: () => {
          throw new Error('boom');
        },
      })
      v!: unknown;
    }
    expect(() => seal(BadType)).toThrow('boom');
    expect((BadType as any)[SEALED]).toBeUndefined();
  });

  it('seal(Class) with throwing collectionValue thunk leaves no SEALED placeholder', () => {
    class BadColl {
      @Field({
        type: () => Set as any,
        setValue: () => {
          throw new Error('coll-boom');
        },
      })
      items!: Set<unknown>;
    }
    expect(() => seal(BadColl)).toThrow(/collectionValue function threw: coll-boom/);
    expect((BadColl as any)[SEALED]).toBeUndefined();
  });

  it('seal(Class) with conflicting requiresType leaves no SEALED placeholder', () => {
    class ConflictReq {
      @Field(isEmail(), min(5)) v!: unknown;
    }
    let caught: unknown;
    try {
      seal(ConflictReq);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(SealError);
    expect((ConflictReq as any)[SEALED]).toBeUndefined();
  });
});
