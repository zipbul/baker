import { describe, it, expect } from 'bun:test';

import type { RuntimeOptions } from '../common/interfaces';
import type { SealedExecutors } from '../seal/interfaces';

import { Baker } from '../baker';
import { Field } from '../decorators/field';
import { BakerError } from '../common/errors';
import { isString } from '../rules/typechecker';
import { resolveSerializeClass, runSerialize } from './serialize';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — build a minimal SealedExecutors to drive runSerialize's dispatch.
// runSerialize takes a sealed executor directly (the Baker resolves it from its map);
// these specs exercise that post-resolution dispatch in isolation.
// ─────────────────────────────────────────────────────────────────────────────

function sealedFor(
  serializeFn: (instance: unknown, opts?: RuntimeOptions) => Record<string, unknown> | Promise<Record<string, unknown>>,
  opts?: { isSerializeAsync?: boolean },
): SealedExecutors<unknown> {
  return {
    deserialize: () => ({}) as never,
    serialize: serializeFn,
    validate: () => null,
    isAsync: false,
    isSerializeAsync: opts?.isSerializeAsync ?? false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests — runSerialize dispatch
// ─────────────────────────────────────────────────────────────────────────────

describe('runSerialize', () => {
  // ── Happy Path ─────────────────────────────────────────────────────────────

  it('should return Record when serialize returns plain object', async () => {
    const record = { name: 'Alice' };
    const result = await runSerialize(sealedFor(() => record), {});
    expect(result).toBe(record);
  });

  it('should pass instance and options to serialize when called', async () => {
    let capturedInstance: unknown;
    let capturedOpts: RuntimeOptions | undefined;
    const instance = { id: 1 };
    const opts: RuntimeOptions = { groups: ['public'] };
    await runSerialize(
      sealedFor((inst, o) => {
        capturedInstance = inst;
        capturedOpts = o;
        return { name: 'x' };
      }),
      instance,
      opts,
    );
    expect(capturedInstance).toBe(instance);
    expect(capturedOpts).toBe(opts);
  });

  // ── Edge ──────────────────────────────────────────────────────────────────

  it('should return empty object when serialize returns {} for instance with no registered fields', async () => {
    const result = await runSerialize(sealedFor(() => ({})), {});
    expect(result).toEqual({});
  });

  // ── Idempotency ────────────────────────────────────────────────────────────

  it('should return identical Record on repeated calls with same instance', async () => {
    const record = { name: 'Bob' };
    const sealed = sealedFor(() => record);
    const instance = {};
    const r1 = await runSerialize(sealed, instance);
    const r2 = await runSerialize(sealed, instance);
    expect(r1).toBe(record);
    expect(r2).toBe(record);
    expect(r1).toBe(r2);
  });

  // ── Sync/Async branching ─────────────────────────────────────────────────

  it('should return direct value when isSerializeAsync is false', () => {
    const record = { x: 1 };
    const result = runSerialize(sealedFor(() => record, { isSerializeAsync: false }), {});
    expect(result).toBe(record);
  });

  it('should use async path when isSerializeAsync is true', async () => {
    const record = { y: 2 };
    const result = await runSerialize(sealedFor(() => Promise.resolve(record), { isSerializeAsync: true }), {});
    expect(result).toBe(record);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveSerializeClass — forgery rejection (boundary shared by Baker.serialize*)
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveSerializeClass', () => {
  it('should return the constructor for a real class instance', () => {
    class RealDto {}
    const instance = new RealDto();
    expect(resolveSerializeClass(instance, 'serialize')).toBe(RealDto);
  });

  it('should throw BakerError for a plain object', () => {
    expect(() => resolveSerializeClass({ name: 'x' }, 'serialize')).toThrow(BakerError);
  });

  it('should throw BakerError for null', () => {
    expect(() => resolveSerializeClass(null, 'serialize')).toThrow(BakerError);
  });

  it('should throw BakerError for a forged constructor reference', () => {
    class RealDto {}
    // `{ constructor: RealDto }` is not `instanceof RealDto` → forgery rejected.
    expect(() => resolveSerializeClass({ constructor: RealDto }, 'serialize')).toThrow(BakerError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Resolution boundary — an instance of a class not sealed by this baker throws.
// ─────────────────────────────────────────────────────────────────────────────

describe('Baker.serialize resolution', () => {
  it('should throw BakerError when instance class is not sealed by this baker', () => {
    const baker = new Baker();
    class UnsealedDto {
      @Field(isString) name!: string;
    }
    expect(() => baker.serialize(new UnsealedDto())).toThrow(BakerError);
  });

  it('should include class name in BakerError message when not sealed', () => {
    const baker = new Baker();
    class MySerializeDto {
      @Field(isString) name!: string;
    }
    expect(() => baker.serialize(new MySerializeDto())).toThrow('MySerializeDto');
  });
});
