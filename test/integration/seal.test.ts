import { describe, it, expect, afterEach } from 'bun:test';
import { Field, deserialize, serialize, createRule, configure, isBakerError } from '../../index';
import type { BakerErrors } from '../../index';
import { isString, isNumber } from '../../src/rules/index';
import { unseal } from './helpers/unseal';
import { SEALED, RAW } from '../../src/symbols';
import { collectValidation } from '../../src/collect';

// ─── DTOs ────────────────────────────────────────────────────────────────────

class SealTestDto {
  @Field(isString)
  name!: string;

  @Field(isNumber())
  age!: number;
}

// ─────────────────────────────────────────────────────────────────────────────

afterEach(() => unseal());

describe('auto-seal — integration', () => {
  it('should auto-seal registered DTOs on first deserialize', async () => {
    await deserialize(SealTestDto, { name: 'Alice', age: 25 });
    const sealed = (SealTestDto as any)[SEALED];
    expect(sealed).toBeDefined();
    expect(typeof sealed._deserialize).toBe('function');
    expect(typeof sealed._serialize).toBe('function');
  });

  it('should auto-seal registered DTOs on first serialize', async () => {
    const dto = Object.assign(new SealTestDto(), { name: 'Bob', age: 30 });
    await serialize(dto);
    const sealed = (SealTestDto as any)[SEALED];
    expect(sealed).toBeDefined();
    expect(typeof sealed._deserialize).toBe('function');
    expect(typeof sealed._serialize).toBe('function');
  });

  it('should allow re-seal after unseal()', async () => {
    await deserialize(SealTestDto, { name: 'Alice', age: 25 });
    unseal();
    const result = await deserialize(SealTestDto, { name: 'Bob', age: 30 });
    expect(isBakerError(result)).toBe(false);
  });

  it('should attach executors after auto-seal', async () => {
    await deserialize(SealTestDto, { name: 'Alice', age: 25 });
    const sealed = (SealTestDto as any)[SEALED];
    expect(sealed).toHaveProperty('_deserialize');
    expect(sealed).toHaveProperty('_serialize');
  });

  it('should remove executors after unseal', async () => {
    await deserialize(SealTestDto, { name: 'Alice', age: 25 });
    unseal();
    expect((SealTestDto as any)[SEALED]).toBeUndefined();
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
  validate: async (v) => typeof v === 'string',
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

class NestedSyncDto {
  @Field(isString)
  label!: string;
}

class ParentWithAsyncNestedDto {
  @Field({ type: () => AsyncTransformDeserializeDto })
  child!: AsyncTransformDeserializeDto;
}

describe('C1 — async architecture (_isAsync / _isSerializeAsync)', () => {
  it('sync DTO → _isAsync === false', async () => {
    await deserialize(SyncDto, { name: 'test' });
    const sealed = (SyncDto as any)[SEALED];
    expect(sealed._isAsync).toBe(false);
  });

  it('async @Transform (deserialize) → _isAsync === true', async () => {
    await deserialize(AsyncTransformDeserializeDto, { name: '  test  ' });
    const sealed = (AsyncTransformDeserializeDto as any)[SEALED];
    expect(sealed._isAsync).toBe(true);
  });

  it('async createRule → _isAsync === true', async () => {
    await deserialize(AsyncRuleDto, { name: 'test' });
    const sealed = (AsyncRuleDto as any)[SEALED];
    expect(sealed._isAsync).toBe(true);
  });

  it('nested async DTO → parent _isAsync === true', async () => {
    await deserialize(ParentWithAsyncNestedDto, { child: { name: '  nested  ' } });
    const sealed = (ParentWithAsyncNestedDto as any)[SEALED];
    expect(sealed._isAsync).toBe(true);
  });

  it('async @Transform (serializeOnly) → _isSerializeAsync === true', async () => {
    const dto = Object.assign(new AsyncTransformSerializeDto(), { price: 9 });
    await serialize(dto);
    const sealed = (AsyncTransformSerializeDto as any)[SEALED];
    expect(sealed._isSerializeAsync).toBe(true);
  });

  it('sync DTO → _isSerializeAsync === false', async () => {
    await deserialize(SyncDto, { name: 'test' });
    const sealed = (SyncDto as any)[SEALED];
    expect(sealed._isSerializeAsync).toBe(false);
  });

  it('async @Transform (deserialize only) → _isSerializeAsync === false', async () => {
    await deserialize(AsyncTransformDeserializeDto, { name: '  test  ' });
    const sealed = (AsyncTransformDeserializeDto as any)[SEALED];
    expect(sealed._isSerializeAsync).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// _ensureSealed → _sealOnDemand path (late-registered class after auto-seal)
// ─────────────────────────────────────────────────────────────────────────────

describe('_ensureSealed — _sealOnDemand fallback', () => {
  it('should seal a late-registered class via _sealOnDemand when serialize is called after auto-seal', async () => {
    await deserialize(SealTestDto, { name: 'Alice', age: 25 });

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

    const instance = Object.assign(new LateDto(), { value: 'hello' });
    const result = await serialize(instance);
    expect(result).toEqual({ value: 'hello' });
    expect((LateDto as any)[SEALED]).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B-10: configure() returns { warnings } for testability
// ─────────────────────────────────────────────────────────────────────────────

// ─── E-25: concurrent seal via Promise.all ──────────────────────────────────

describe('E-25: concurrent seal via Promise.all', () => {
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
    const [a, b, c] = await Promise.all([
      deserialize<ConcurrentA>(ConcurrentA, { a: 'hello' }),
      deserialize<ConcurrentB>(ConcurrentB, { b: 42 }),
      deserialize<ConcurrentC>(ConcurrentC, { c: 'world', d: 99 }),
    ]) as [ConcurrentA, ConcurrentB, ConcurrentC];
    expect(a).toBeInstanceOf(ConcurrentA);
    expect(a.a).toBe('hello');
    expect(b).toBeInstanceOf(ConcurrentB);
    expect(b.b).toBe(42);
    expect(c).toBeInstanceOf(ConcurrentC);
    expect(c.c).toBe('world');
    expect(c.d).toBe(99);
  });

  it('concurrent seal: all classes are sealed after Promise.all', async () => {
    await Promise.all([
      deserialize(ConcurrentA, { a: 'x' }),
      deserialize(ConcurrentB, { b: 1 }),
      deserialize(ConcurrentC, { c: 'y', d: 2 }),
    ]);
    expect((ConcurrentA as any)[SEALED]).toBeDefined();
    expect((ConcurrentB as any)[SEALED]).toBeDefined();
    expect((ConcurrentC as any)[SEALED]).toBeDefined();
  });
});

describe('configure() — return warnings (B-10)', () => {
  it('should return empty warnings when called before seal', () => {
    const result = configure({});
    expect(result.warnings).toEqual([]);
  });

  it('should return a warning when called after auto-seal', async () => {
    await deserialize(SealTestDto, { name: 'Alice', age: 25 });

    const result = configure({ autoConvert: true });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('called after auto-seal');
  });

  it('should return empty warnings again after unseal + re-configure', async () => {
    await deserialize(SealTestDto, { name: 'Alice', age: 25 });
    unseal();

    const result = configure({});
    expect(result.warnings).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E-15: partial seal + reconfigure — unseal, change config, re-seal verifies effect
// ─────────────────────────────────────────────────────────────────────────────

describe('E-15: partial seal + reconfigure takes effect after unseal', () => {
  it('should apply new forbidUnknown config after unseal + reconfigure', async () => {
    const r1 = await deserialize<any>(SealTestDto, { name: 'Alice', age: 25, extra: 'ok' }) as any;
    expect(r1.name).toBe('Alice');

    unseal();
    configure({ forbidUnknown: true });

    const result = await deserialize(SealTestDto, { name: 'Bob', age: 30, extra: 'bad' });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      const err = result.errors.find((x: any) => x.code === 'whitelistViolation');
      expect(err).toBeDefined();
    }
  });

  it('should remove forbidUnknown effect after unseal + reconfigure without it', async () => {
    configure({ forbidUnknown: true });
    const result1 = await deserialize(SealTestDto, { name: 'Alice', age: 25, extra: 'bad' });
    expect(isBakerError(result1)).toBe(true);

    unseal();
    configure({});

    const result = await deserialize<any>(SealTestDto, { name: 'Bob', age: 30, extra: 'ok' }) as any;
    expect(result.name).toBe('Bob');
  });
});
