import { describe, it, expect, afterEach, beforeEach } from 'bun:test';

import { Field, deserialize, serialize, createRule, configure, isBakerError, SealError, seal } from '../../index';
import { getSealed, setRaw, requireSealed } from '../../src/meta-access';
import { isString, isNumber, isEmail, min } from '../../src/rules/index';
import { assertBakerError } from './helpers/assert';
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
    const sealed = requireSealed(SealTestDto);
    expect(sealed).toBeDefined();
    expect(typeof sealed.deserialize).toBe('function');
    expect(typeof sealed.serialize).toBe('function');
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
    expect(getSealed(SealTestDto)).toBeDefined();
  });

  it('unseal() removes SEALED executors', () => {
    expect(getSealed(SealTestDto)).toBeDefined();
    unseal();
    expect(getSealed(SealTestDto)).toBeUndefined();
  });

  it('seal() after unseal() re-seals', () => {
    unseal();
    expect(getSealed(SealTestDto)).toBeUndefined();
    seal();
    expect(getSealed(SealTestDto)).toBeDefined();
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
// C1: async architecture — isAsync / isSerializeAsync flags
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

describe('C1 — async architecture (isAsync / isSerializeAsync)', () => {
  it('sync DTO → isAsync === false', () => {
    const sealed = requireSealed(SyncDto);
    expect(sealed.isAsync).toBe(false);
  });

  it('async @Transform (deserialize) → isAsync === true', () => {
    const sealed = requireSealed(AsyncTransformDeserializeDto);
    expect(sealed.isAsync).toBe(true);
  });

  it('async createRule → isAsync === true', () => {
    const sealed = requireSealed(AsyncRuleDto);
    expect(sealed.isAsync).toBe(true);
  });

  it('nested async DTO → parent isAsync === true', () => {
    const sealed = requireSealed(ParentWithAsyncNestedDto);
    expect(sealed.isAsync).toBe(true);
  });

  it('async @Transform (serializeOnly) → isSerializeAsync === true', () => {
    const sealed = requireSealed(AsyncTransformSerializeDto);
    expect(sealed.isSerializeAsync).toBe(true);
  });

  it('sync DTO → isSerializeAsync === false', () => {
    const sealed = requireSealed(SyncDto);
    expect(sealed.isSerializeAsync).toBe(false);
  });

  it('deserialize-only async transform keeps isSerializeAsync false', () => {
    const sealed = requireSealed(AsyncTransformDeserializeDto);
    expect(sealed.isSerializeAsync).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// seal(Class) — on-demand seal for late-registered classes
// ─────────────────────────────────────────────────────────────────────────────

describe('seal(Class) — on-demand', () => {
  it('seal(LateDto) seals a late-registered class', async () => {
    class LateDto {}
    setRaw(LateDto, {
      value: {
        validation: [{ rule: isString }],
        transform: [],
        expose: [],
        exclude: null,
        type: null,
        flags: {},
      },
    });

    seal(LateDto);
    expect(getSealed(LateDto)).toBeDefined();

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
    expect(getSealed(ConcurrentA)).toBeDefined();
    expect(getSealed(ConcurrentB)).toBeDefined();
    expect(getSealed(ConcurrentC)).toBeDefined();
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
    const r1 = (await deserialize<SealTestDto>(SealTestDto, { name: 'Alice', age: 25, extra: 'ok' })) as SealTestDto;
    expect(r1.name).toBe('Alice');

    unseal();
    configure({ forbidUnknown: true });
    seal();

    const result = await deserialize(SealTestDto, { name: 'Bob', age: 30, extra: 'bad' });
    assertBakerError(result);
    const err = result.errors.find((x: { code: string }) => x.code === 'whitelistViolation');
    expect(err).toBeDefined();
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

    const result = (await deserialize<SealTestDto>(SealTestDto, { name: 'Bob', age: 30, extra: 'ok' })) as SealTestDto;
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
        type: () => Set,
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
    expect(getSealed(ParentWrap)).toBeUndefined();
    expect(getSealed(NestedConflict)).toBeUndefined();
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
    expect(getSealed(BadType)).toBeUndefined();
  });

  it('seal(Class) with throwing collectionValue thunk leaves no SEALED placeholder', () => {
    class BadColl {
      @Field({
        type: () => Set,
        setValue: () => {
          throw new Error('coll-boom');
        },
      })
      items!: Set<unknown>;
    }
    expect(() => seal(BadColl)).toThrow(/collectionValue function threw: coll-boom/);
    expect(getSealed(BadColl)).toBeUndefined();
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
    expect(getSealed(ConflictReq)).toBeUndefined();
  });
});
