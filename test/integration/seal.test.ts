import { describe, it, expect } from 'bun:test';

import { Field, Baker, createRule, isBakerIssueSet, BakerError } from '../../index';
import { metaStore } from '../../src/metadata';
import { isString, isNumber, isEmail, min } from '../../src/rules/index';
import { assertBakerIssueSet } from './helpers/assert';

// ─── DTOs ────────────────────────────────────────────────────────────────────

const baker = new Baker();

@baker.Recipe
class SealTestDto {
  @Field(isString)
  name!: string;

  @Field(isNumber())
  age!: number;
}

baker.seal();

// ─────────────────────────────────────────────────────────────────────────────

describe('baker.seal() — explicit seal at startup', () => {
  it('baker.seal() makes the class deserializable and serializable', async () => {
    const r = await baker.deserialize(SealTestDto, { name: 'Alice', age: 25 });
    expect(isBakerIssueSet(r)).toBe(false);
    const dto = Object.assign(new SealTestDto(), { name: 'Bob', age: 30 });
    expect(await baker.serialize(dto)).toEqual({ name: 'Bob', age: 30 });
  });

  it('deserialize works after explicit baker.seal()', async () => {
    const r = await baker.deserialize(SealTestDto, { name: 'Alice', age: 25 });
    expect(isBakerIssueSet(r)).toBe(false);
  });

  it('serialize works after explicit baker.seal()', async () => {
    const dto = Object.assign(new SealTestDto(), { name: 'Bob', age: 30 });
    const r = await baker.serialize(dto);
    expect(r).toEqual({ name: 'Bob', age: 30 });
  });

  it('baker.seal() is idempotent — calling again is a no-op', async () => {
    expect(() => baker.seal()).not.toThrow();
    expect(() => baker.seal()).not.toThrow();
    expect(isBakerIssueSet(await baker.deserialize(SealTestDto, { name: 'Alice', age: 25 }))).toBe(false);
  });
});

describe('baker.seal() — error when not sealed', () => {
  it('deserialize throws BakerError when class is not sealed', () => {
    const b = new Baker();
    @b.Recipe
    class Unsealed {
      @Field(isString) name!: string;
      @Field(isNumber()) age!: number;
    }
    expect(() => b.deserialize(Unsealed, { name: 'x', age: 1 })).toThrow(BakerError);
  });

  it('serialize throws BakerError when class is not sealed', () => {
    const b = new Baker();
    @b.Recipe
    class Unsealed {
      @Field(isString) name!: string;
      @Field(isNumber()) age!: number;
    }
    const dto = Object.assign(new Unsealed(), { name: 'x', age: 1 });
    expect(() => b.serialize(dto)).toThrow(BakerError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C1: async architecture — isAsync / isSerializeAsync flags
// ─────────────────────────────────────────────────────────────────────────────

const asyncBaker = new Baker();

@asyncBaker.Recipe
class SyncDto {
  @Field(isString)
  name!: string;
}

@asyncBaker.Recipe
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

@asyncBaker.Recipe
class AsyncRuleDto {
  @Field({ rules: [asyncRule] })
  name!: string;
}

@asyncBaker.Recipe
class AsyncTransformSerializeDto {
  @Field(isNumber(), {
    transform: {
      deserialize: ({ value }) => value,
      serialize: async ({ value }) => (typeof value === 'number' ? value * 100 : value),
    },
  })
  price!: number;
}

@asyncBaker.Recipe
class ParentWithAsyncNestedDto {
  @Field({ type: () => AsyncTransformDeserializeDto })
  child!: AsyncTransformDeserializeDto;
}

asyncBaker.seal();

// An async executor returns a Promise from deserialize / serialize; a sync one returns directly.
// These are the observable equivalents of the internal isAsync / isSerializeAsync flags.
describe('C1 — async architecture (isAsync / isSerializeAsync)', () => {
  it('sync DTO → deserialize returns synchronously (isAsync === false)', () => {
    expect(asyncBaker.deserialize(SyncDto, { name: 'x' })).not.toBeInstanceOf(Promise);
  });

  it('async @Transform (deserialize) → deserialize returns a Promise (isAsync === true)', () => {
    expect(asyncBaker.deserialize(AsyncTransformDeserializeDto, { name: 'x' })).toBeInstanceOf(Promise);
  });

  it('async createRule → deserialize returns a Promise (isAsync === true)', () => {
    expect(asyncBaker.deserialize(AsyncRuleDto, { name: 'x' })).toBeInstanceOf(Promise);
  });

  it('nested async DTO → parent deserialize returns a Promise (isAsync === true)', () => {
    expect(asyncBaker.deserialize(ParentWithAsyncNestedDto, { child: { name: 'x' } })).toBeInstanceOf(Promise);
  });

  it('async @Transform (serializeOnly) → serialize returns a Promise (isSerializeAsync === true)', () => {
    const dto = Object.assign(new AsyncTransformSerializeDto(), { price: 1 });
    expect(asyncBaker.serialize(dto)).toBeInstanceOf(Promise);
  });

  it('sync DTO → serialize returns synchronously (isSerializeAsync === false)', () => {
    const dto = Object.assign(new SyncDto(), { name: 'x' });
    expect(asyncBaker.serialize(dto)).not.toBeInstanceOf(Promise);
  });

  it('deserialize-only async transform keeps serialize synchronous (isSerializeAsync false)', () => {
    const dto = Object.assign(new AsyncTransformDeserializeDto(), { name: 'x' });
    expect(asyncBaker.serialize(dto)).not.toBeInstanceOf(Promise);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Baker.seal() — seal a late-registered class (metadata set manually)
// ─────────────────────────────────────────────────────────────────────────────

describe('baker.seal() — late-registered class', () => {
  it('seals a class registered via baker.Recipe with manually-set metadata', async () => {
    const b = new Baker();
    class LateDto {}
    metaStore.set(LateDto, {
      value: {
        validation: [{ rule: isString }],
        transform: [],
        expose: [],
        exclude: null,
        type: null,
        flags: {},
      },
    });
    b.Recipe(LateDto, null as never);
    b.seal();

    const instance = Object.assign(new LateDto(), { value: 'hello' });
    const result = await b.serialize(instance);
    expect(result).toEqual({ value: 'hello' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E-25: concurrent seal via Promise.all
// ─────────────────────────────────────────────────────────────────────────────

describe('E-25: concurrent deserialize on pre-sealed classes', () => {
  const cb = new Baker();

  @cb.Recipe
  class ConcurrentA {
    @Field(isString)
    a!: string;
  }

  @cb.Recipe
  class ConcurrentB {
    @Field(isNumber())
    b!: number;
  }

  @cb.Recipe
  class ConcurrentC {
    @Field(isString)
    c!: string;

    @Field(isNumber())
    d!: number;
  }

  cb.seal();

  it('3 DTO classes deserialized concurrently via Promise.all → all succeed', async () => {
    const [a, b, c] = (await Promise.all([
      cb.deserialize<ConcurrentA>(ConcurrentA, { a: 'hello' }),
      cb.deserialize<ConcurrentB>(ConcurrentB, { b: 42 }),
      cb.deserialize<ConcurrentC>(ConcurrentC, { c: 'world', d: 99 }),
    ])) as [ConcurrentA, ConcurrentB, ConcurrentC];
    expect(a).toBeInstanceOf(ConcurrentA);
    expect(a.a).toBe('hello');
    expect(b).toBeInstanceOf(ConcurrentB);
    expect(b.b).toBe(42);
    expect(c).toBeInstanceOf(ConcurrentC);
    expect(c.c).toBe('world');
    expect(c.d).toBe(99);
  });

  it('all classes are sealed via baker.seal()', () => {
    expect(() => cb.deserialize(ConcurrentA, { a: 'x' })).not.toThrow();
    expect(() => cb.deserialize(ConcurrentB, { b: 1 })).not.toThrow();
    expect(() => cb.deserialize(ConcurrentC, { c: 'x', d: 1 })).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// forbidUnknown config takes effect per-baker
// ─────────────────────────────────────────────────────────────────────────────

describe('forbidUnknown config takes effect per-baker', () => {
  it('a baker with forbidUnknown rejects undeclared fields', async () => {
    const b = new Baker({ forbidUnknown: true });
    @b.Recipe
    class Strict {
      @Field(isString) name!: string;
      @Field(isNumber()) age!: number;
    }
    b.seal();
    const result = await b.deserialize(Strict, { name: 'Bob', age: 30, extra: 'bad' });
    assertBakerIssueSet(result);
    const err = result.errors.find((x: { code: string }) => x.code === 'whitelistViolation');
    expect(err).toBeDefined();
  });

  it('a baker without forbidUnknown ignores undeclared fields', async () => {
    const b = new Baker();
    @b.Recipe
    class Lenient {
      @Field(isString) name!: string;
      @Field(isNumber()) age!: number;
    }
    b.seal();
    const result = (await b.deserialize<Lenient>(Lenient, { name: 'Bob', age: 30, extra: 'ok' })) as Lenient;
    expect(result.name).toBe('Bob');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// seal failure paths — transactional cleanup
// ─────────────────────────────────────────────────────────────────────────────

describe('baker.seal() — transactional failure cleanup', () => {
  it('nested setValue thunk thrown during analyzeCircular wraps in BakerError', () => {
    const b = new Baker();
    @b.Recipe
    class NestedBad {
      @Field({
        type: () => Set,
        setValue: () => {
          throw new Error('nested-boom');
        },
      })
      items!: Set<unknown>;
    }
    @b.Recipe
    class ParentRef {
      @Field({ type: () => NestedBad })
      child!: NestedBad;
    }
    void ParentRef;
    expect(() => b.seal()).toThrow(/nested-boom/);
  });

  it('failed nested seal cleans up both parent and nested placeholders', () => {
    const b = new Baker();
    @b.Recipe
    class NestedConflict {
      @Field(isEmail(), min(5)) v!: unknown;
    }
    @b.Recipe
    class ParentWrap {
      @Field({ type: () => NestedConflict }) child!: NestedConflict;
    }
    expect(() => b.seal()).toThrow(/conflicting requiresType/);
    expect(() => b.deserialize(ParentWrap, {})).toThrow(/not sealed by this baker/);
    expect(() => b.deserialize(NestedConflict, {})).toThrow(/not sealed by this baker/);
  });

  it('seal with throwing @Type thunk leaves no executor', () => {
    const b = new Baker();
    @b.Recipe
    class BadType {
      @Field({
        type: () => {
          throw new Error('boom');
        },
      })
      v!: unknown;
    }
    expect(() => b.seal()).toThrow('boom');
    expect(() => b.deserialize(BadType, {})).toThrow(/not sealed by this baker/);
  });

  it('seal with throwing collectionValue thunk leaves no executor', () => {
    const b = new Baker();
    @b.Recipe
    class BadColl {
      @Field({
        type: () => Set,
        setValue: () => {
          throw new Error('coll-boom');
        },
      })
      items!: Set<unknown>;
    }
    expect(() => b.seal()).toThrow(/collectionValue function threw: coll-boom/);
    expect(() => b.deserialize(BadColl, {})).toThrow(/not sealed by this baker/);
  });

  it('seal with conflicting requiresType leaves no executor', () => {
    const b = new Baker();
    @b.Recipe
    class ConflictReq {
      @Field(isEmail(), min(5)) v!: unknown;
    }
    let caught: unknown;
    try {
      b.seal();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(BakerError);
    expect(() => b.deserialize(ConflictReq, {})).toThrow(/not sealed by this baker/);
  });

  it('a fresh baker succeeds after a separate baker failed to seal', () => {
    const bad = new Baker();
    @bad.Recipe
    class BadRetry {
      @Field(isEmail(), min(5)) v!: unknown;
    }
    expect(() => bad.seal()).toThrow(BakerError);
    expect(() => bad.deserialize(BadRetry, {})).toThrow(/not sealed by this baker/);
    // A subsequent unrelated seal must work — the failed attempt left nothing behind.
    const good = new Baker();
    @good.Recipe
    class GoodRetry {
      @Field(isString) name!: string;
    }
    expect(() => good.seal()).not.toThrow();
    expect(() => good.deserialize(GoodRetry, { name: 'x' })).not.toThrow();
  });
});

describe('baker.seal() — @baker.Recipe discovery', () => {
  it('baker.seal() does NOT seal a class that has @Field but is not registered to the baker', () => {
    const b = new Baker();
    @b.Recipe
    class Registered {
      @Field(isString) name!: string;
    }
    class FieldOnly {
      @Field(isString) name!: string;
    }
    b.seal();
    void Registered;
    expect(() => b.deserialize(FieldOnly, { name: 'x' })).toThrow(BakerError);
  });

  it('baker.seal() seals a nested DTO reachable via @Field type even without its own @baker.Recipe', () => {
    const b = new Baker();
    class NestedNoRecipe {
      @Field(isString) v!: string;
    }
    @b.Recipe
    class ParentWithNested {
      @Field({ type: () => NestedNoRecipe }) child!: NestedNoRecipe;
    }
    b.seal();
    const out = b.deserialize(ParentWithNested, { child: { v: 'ok' } });
    expect(isBakerIssueSet(out)).toBe(false);
  });
});
