import { describe, it, expect, afterEach } from 'bun:test';
import { Field, deserialize, serialize, createRule } from '../../index';
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
    // Should not throw — auto-seal triggers again
    await expect(deserialize(SealTestDto, { name: 'Bob', age: 30 })).resolves.toBeDefined();
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
// C1: async 아키텍처 — _isAsync / _isSerializeAsync 플래그
// ─────────────────────────────────────────────────────────────────────────────

class SyncDto {
  @Field(isString)
  name!: string;
}

class AsyncTransformDeserializeDto {
  @Field(isString, {
    transform: async ({ value }) => (typeof value === 'string' ? value.trim() : value),
    transformDirection: 'deserializeOnly',
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
    transform: async ({ value }) => (typeof value === 'number' ? value * 100 : value),
    transformDirection: 'serializeOnly',
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
    // 1. Trigger auto-seal with an existing DTO
    await deserialize(SealTestDto, { name: 'Alice', age: 25 });

    // 2. Define a new class AFTER auto-seal — manually attach RAW metadata
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

    // 3. serialize triggers _ensureSealed → _autoSeal (no-op) → _sealOnDemand
    const instance = Object.assign(new LateDto(), { value: 'hello' });
    const result = await serialize(instance);
    expect(result).toEqual({ value: 'hello' });
    expect((LateDto as any)[SEALED]).toBeDefined();
  });
});
