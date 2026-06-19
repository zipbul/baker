import { describe, it, expect, mock } from 'bun:test';

import type { EmitContext } from './types';

import { isUint8Array, isByteSize } from './binary';

function makeCtx(refIndex: number = 0) {
  const addRefMock = mock((_fn: unknown) => refIndex);
  const failMock = mock((code: string) => `errors.push({path:'x',code:'${code}'})`);
  const ctx: Partial<EmitContext> = {
    addRegex: mock((_re: RegExp) => 0),
    addRef: addRefMock,
    addExecutor: mock(() => 0),
    fail: failMock,
    collectErrors: true,
  };
  return { ctx: ctx as EmitContext, addRefMock, failMock };
}

// ─── isUint8Array ──────────────────────────────────────────────────────────────

describe('isUint8Array', () => {
  it('should return true when value is an empty Uint8Array', () => {
    expect(isUint8Array(new Uint8Array(0))).toBe(true);
  });

  it('should return true when value is a non-empty Uint8Array', () => {
    expect(isUint8Array(new Uint8Array([1, 2, 3]))).toBe(true);
  });

  it('should return true when value is a Buffer (Uint8Array subclass)', () => {
    expect(isUint8Array(Buffer.from([1]))).toBe(true);
  });

  it('should return false when value is a Uint8ClampedArray (sibling type)', () => {
    expect(isUint8Array(new Uint8ClampedArray(1))).toBe(false);
  });

  it('should return false when value is a DataView', () => {
    expect(isUint8Array(new DataView(new ArrayBuffer(1)))).toBe(false);
  });

  it('should return false when value is a plain array', () => {
    expect(isUint8Array([1, 2, 3])).toBe(false);
  });

  it('should return false when value is a string', () => {
    expect(isUint8Array('abc')).toBe(false);
  });

  it('should return false when value is null', () => {
    expect(isUint8Array(null)).toBe(false);
  });

  it('should return false when value is undefined', () => {
    expect(isUint8Array(undefined)).toBe(false);
  });

  it('should generate an instanceof Uint8Array check and fail with isUint8Array when calling emit()', () => {
    const { ctx, failMock } = makeCtx();
    const code = isUint8Array.emit('v', ctx);
    expect(code).toContain('instanceof Uint8Array');
    expect(failMock).toHaveBeenCalledWith('isUint8Array');
  });

  it('should expose ruleName isUint8Array', () => {
    expect(isUint8Array.ruleName).toBe('isUint8Array');
  });

  it('should not declare a requiresType (instanceof is self-narrowing)', () => {
    expect(isUint8Array.requiresType).toBeUndefined();
  });
});

// ─── isByteSize ────────────────────────────────────────────────────────────────

describe('isByteSize', () => {
  // BVA on min only (min = 16)
  it('should return false when byteLength is one below min', () => {
    expect(isByteSize(16)(new Uint8Array(15))).toBe(false);
  });

  it('should return true when byteLength equals min', () => {
    expect(isByteSize(16)(new Uint8Array(16))).toBe(true);
  });

  it('should return true when byteLength is one above min', () => {
    expect(isByteSize(16)(new Uint8Array(17))).toBe(true);
  });

  // BVA on [min, max] range (16..32)
  it('should return false when byteLength is below min of a range', () => {
    expect(isByteSize(16, 32)(new Uint8Array(15))).toBe(false);
  });

  it('should return true when byteLength equals the lower bound', () => {
    expect(isByteSize(16, 32)(new Uint8Array(16))).toBe(true);
  });

  it('should return true when byteLength equals the upper bound', () => {
    expect(isByteSize(16, 32)(new Uint8Array(32))).toBe(true);
  });

  it('should return false when byteLength is one above max', () => {
    expect(isByteSize(16, 32)(new Uint8Array(33))).toBe(false);
  });

  // min === max exact range (16..16)
  it('should return false when below an exact-size range', () => {
    expect(isByteSize(16, 16)(new Uint8Array(15))).toBe(false);
  });

  it('should return true when matching an exact-size range', () => {
    expect(isByteSize(16, 16)(new Uint8Array(16))).toBe(true);
  });

  it('should return false when above an exact-size range', () => {
    expect(isByteSize(16, 16)(new Uint8Array(17))).toBe(false);
  });

  // min = 0 floor — empty views are admissible
  it('should return true for an empty Uint8Array when min is 0', () => {
    expect(isByteSize(0)(new Uint8Array(0))).toBe(true);
  });

  // Type partitions — byteLength counts bytes, not elements
  it('should count bytes not elements for a Uint16Array', () => {
    // 8 elements * 2 bytes = 16 bytes
    expect(isByteSize(16)(new Uint16Array(8))).toBe(true);
  });

  it('should count bytes not elements for a Float64Array', () => {
    // 2 elements * 8 bytes = 16 bytes
    expect(isByteSize(16)(new Float64Array(2))).toBe(true);
  });

  // Offset/subarray window — byteLength reflects the view window, not the backing buffer
  it('should measure the view window not the backing buffer for an offset subarray below min', () => {
    // 32-byte buffer, but the view exposes only 8 bytes
    expect(isByteSize(16)(new Uint8Array(new ArrayBuffer(32), 8, 8))).toBe(false);
  });

  it('should measure the view window not the backing buffer for an offset subarray at min', () => {
    expect(isByteSize(16)(new Uint8Array(new ArrayBuffer(32), 8, 16))).toBe(true);
  });

  // SharedArrayBuffer-backed view — accepted (crypto buffers may be shared)
  it('should return true for a SharedArrayBuffer-backed Uint8Array of sufficient size', () => {
    expect(isByteSize(16)(new Uint8Array(new SharedArrayBuffer(16)))).toBe(true);
  });

  it('should return true for a DataView of sufficient byte size', () => {
    expect(isByteSize(16)(new DataView(new ArrayBuffer(16)))).toBe(true);
  });

  // Non-view rejection
  it('should return false when value is a plain array', () => {
    expect(isByteSize(1)([1, 2, 3])).toBe(false);
  });

  it('should return false when value is a string of sufficient char length', () => {
    expect(isByteSize(16)('abcdefghijklmnop')).toBe(false);
  });

  it('should return false when value is a duck-typed object with byteLength', () => {
    expect(isByteSize(1)({ byteLength: 99 })).toBe(false);
  });

  it('should return false when value is null', () => {
    expect(isByteSize(1)(null)).toBe(false);
  });

  // Order hazard (F1): the isView guard must short-circuit BEFORE any .byteLength read, or a
  // non-view with a hostile/absent byteLength would throw instead of cleanly failing. A throwing
  // getter proves validate() never reaches the read for a non-view.
  it('should not read byteLength for a non-view (validate guards isView first)', () => {
    const trap = {
      get byteLength(): number {
        throw new Error('byteLength read before ArrayBuffer.isView guard');
      },
    };
    expect(isByteSize(1)(trap as unknown as ArrayBufferView)).toBe(false);
  });

  // emit — min only
  it('should generate an isView guard and a min check when calling emit() with min only', () => {
    const { ctx, failMock } = makeCtx();
    const code = isByteSize(16).emit('v', ctx);
    expect(code).toContain('ArrayBuffer.isView(v)');
    expect(code).toContain('v.byteLength < 16');
    expect(code).not.toContain('byteLength >');
    expect(failMock).toHaveBeenCalledWith('isByteSize');
  });

  // emit — min + max
  it('should generate a max check when calling emit() with min and max', () => {
    const { ctx } = makeCtx();
    const code = isByteSize(16, 32).emit('v', ctx);
    expect(code).toContain('v.byteLength < 16');
    expect(code).toContain('v.byteLength > 32');
  });

  // Order hazard (F1) at the codegen level, proven by EXECUTION (not string inspection): the
  // makeCtx fail() mock emits `errors.push(...)`, so the emitted body can be compiled and run.
  // Feeding a non-view with a throwing byteLength getter, a guard-first body rejects cleanly
  // (errors.push) and never throws; a body that reads byteLength before the isView guard throws.
  it('should short-circuit the isView guard before reading byteLength when the generated code runs', () => {
    const { ctx } = makeCtx();
    const code = isByteSize(16).emit('v', ctx);
    const run = new Function('v', 'errors', code) as (v: unknown, errors: unknown[]) => void;
    const trap = {
      get byteLength(): number {
        throw new Error('byteLength read before ArrayBuffer.isView guard');
      },
    };
    const errors: unknown[] = [];
    expect(() => run(trap, errors)).not.toThrow();
    expect(errors).toHaveLength(1);
  });

  // Chaining is a design claim (the max check is else-if, not a standalone if).
  it('should chain the max check as an else-if after the min check', () => {
    const { ctx } = makeCtx();
    const code = isByteSize(16, 32).emit('v', ctx);
    expect(code).toContain('else if (v.byteLength > 32)');
  });

  // validate/emit parity for degenerate NaN bounds (a caller bug, but the two paths MUST agree).
  // Fail-form `bl < NaN === false` ⇒ both treat a NaN min as no lower bound and accept.
  it('should treat a NaN min identically in validate() and generated code (parity)', () => {
    const view = new Uint8Array(8);
    expect(isByteSize(NaN)(view)).toBe(true);

    const { ctx } = makeCtx();
    const code = isByteSize(NaN).emit('v', ctx);
    const run = new Function('v', 'errors', code) as (v: unknown, errors: unknown[]) => void;
    const errors: unknown[] = [];
    run(view, errors);
    expect(errors).toHaveLength(0);
  });

  it('should expose ruleName isByteSize', () => {
    expect(isByteSize(16).ruleName).toBe('isByteSize');
  });

  it('should not declare a requiresType (self-contained type check)', () => {
    expect(isByteSize(16).requiresType).toBeUndefined();
  });

  it('should expose min and max in constraints', () => {
    expect(isByteSize(16, 32).constraints).toEqual({ min: 16, max: 32 });
  });
});
