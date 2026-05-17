import { err } from '@zipbul/result';
import { describe, it, expect, afterEach } from 'bun:test';

import type { RuntimeOptions } from '../interfaces';

import { isBakerError, SealError } from '../errors';
import { globalRegistry } from '../registry';
import { resetForTesting } from '../seal/seal';
import { deserialize } from './deserialize';
import { setSealed, deleteSealed } from '../meta-access';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const trackedClasses: Function[] = [];

function makeClass(name = 'TestDto'): new (...args: never[]) => object {
  const ctor = class {};
  Object.defineProperty(ctor, 'name', { value: name });
  trackedClasses.push(ctor);
  return ctor;
}

function attachSealed(
  ctor: Function,
  deserializeFn: (input: unknown, opts?: RuntimeOptions) => unknown,
  opts?: { isAsync?: boolean },
): void {
  setSealed(ctor, {
    deserialize: deserializeFn,
    serialize: () => ({}),
    validate: () => null,
    isAsync: opts?.isAsync ?? false,
    isSerializeAsync: false,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Cleanup
// ─────────────────────────────────────────────────────────────────────────────

afterEach(() => {
  for (const ctor of trackedClasses) {
    globalRegistry.delete(ctor);
    deleteSealed(ctor);
  }
  trackedClasses.length = 0;
  resetForTesting();
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('deserialize', () => {
  // ── Happy Path ─────────────────────────────────────────────────────────────

  it('should return T instance when deserialize returns valid value', async () => {
    const Dto = makeClass();
    const instance = new Dto();
    attachSealed(Dto, () => instance);
    const result = await deserialize(Dto, { name: 'Alice' });
    expect(isBakerError(result)).toBe(false);
    expect(result).toBe(instance);
  });

  it('should pass options to deserialize when RuntimeOptions provided', async () => {
    const Dto = makeClass();
    const instance = new Dto();
    let capturedOpts: RuntimeOptions | undefined;
    attachSealed(Dto, (_input, opts) => {
      capturedOpts = opts;
      return instance;
    });
    const opts: RuntimeOptions = { groups: ['admin'] };
    await deserialize(Dto, {}, opts);
    expect(capturedOpts).toBe(opts);
  });

  it('should pass input to deserialize when called with object input', async () => {
    const Dto = makeClass();
    const instance = new Dto();
    let capturedInput: unknown;
    attachSealed(Dto, input => {
      capturedInput = input;
      return instance;
    });
    const payload = { name: 'Bob', extra: 'ignored' };
    await deserialize(Dto, payload);
    expect(capturedInput).toBe(payload);
  });

  // ── Negative / Error ───────────────────────────────────────────────────────

  it('should throw SealError when class has no [SEALED] executor', () => {
    const Dto = makeClass('UnsealedDto');
    expect(() => deserialize(Dto, {})).toThrow(SealError);
  });

  it('should include class name in SealError message when not sealed', () => {
    const Dto = makeClass('MyDto');
    let caught: SealError | undefined;
    try {
      deserialize(Dto, {});
    } catch (e) {
      caught = e as SealError;
    }
    expect(caught).toBeInstanceOf(SealError);
    expect(caught!.message).toContain('MyDto');
  });

  it('should return BakerErrors when deserialize returns Err', async () => {
    const Dto = makeClass();
    const errors = [{ path: 'name', code: 'isString' }];
    attachSealed(Dto, () => err(errors));
    const result = await deserialize(Dto, { name: 42 });
    expect(isBakerError(result)).toBe(true);
  });

  it('should attach errors array to BakerErrors when deserialize fails', async () => {
    const Dto = makeClass();
    const errors = [
      { path: 'name', code: 'isString' },
      { path: 'email', code: 'isEmail' },
    ];
    attachSealed(Dto, () => err(errors));
    const result = await deserialize(Dto, {});
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors).toEqual(errors);
    }
  });

  it('should return BakerErrors(code:invalidInput) when deserialize returns invalidInput error', async () => {
    const Dto = makeClass();
    attachSealed(Dto, () => err([{ path: '', code: 'invalidInput' }]));
    const result = await deserialize(Dto, null);
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors[0]!.code).toBe('invalidInput');
    }
  });

  it('should return BakerErrors when deserialize returns Err for array input', async () => {
    const Dto = makeClass();
    attachSealed(Dto, () => err([{ path: '', code: 'invalidInput' }]));
    const result = await deserialize(Dto, [1, 2, 3]);
    expect(isBakerError(result)).toBe(true);
  });

  // ── Edge ──────────────────────────────────────────────────────────────────

  it('should return T when deserialize succeeds with empty {} input for class with no fields', async () => {
    const Dto = makeClass();
    const instance = new Dto();
    attachSealed(Dto, () => instance);
    const result = await deserialize(Dto, {});
    expect(result).toBe(instance);
  });

  // ── State Transition ───────────────────────────────────────────────────────

  it('should work again when [SEALED] is re-attached after being deleted', async () => {
    const Dto = makeClass();
    const instance1 = new Dto();
    const instance2 = new Dto();
    attachSealed(Dto, () => instance1);
    await deserialize(Dto, {});
    deleteSealed(Dto);
    attachSealed(Dto, () => instance2);
    const result = await deserialize(Dto, {});
    expect(result).toBe(instance2);
  });

  // ── Idempotency ────────────────────────────────────────────────────────────

  it('should return independent T instances on repeated calls with same input', async () => {
    const Dto = makeClass();
    let idx = 0;
    const inst0 = new Dto();
    const inst1 = new Dto();
    const instances = [inst0, inst1] as const;
    attachSealed(Dto, () => instances[idx++]);
    const input = { name: 'Alice' };
    const r1 = await deserialize(Dto, input);
    const r2 = await deserialize(Dto, input);
    expect(r1).toBe(inst0);
    expect(r2).toBe(inst1);
  });

  // ── Sync/Async branching ─────────────────────────────────────────────────

  it('should return direct value when isAsync is false', () => {
    const Dto = makeClass();
    const instance = new Dto();
    attachSealed(Dto, () => instance, { isAsync: false });
    const result = deserialize(Dto, {});
    expect(result).toBe(instance);
  });

  it('should use async path when isAsync is true', async () => {
    const Dto = makeClass();
    const instance = new Dto();
    attachSealed(Dto, () => Promise.resolve(instance), { isAsync: true });
    const result = await deserialize(Dto, {});
    expect(result).toBe(instance);
  });

  it('should return BakerErrors when sync executor returns Err', async () => {
    const Dto = makeClass();
    attachSealed(Dto, () => err([{ path: 'x', code: 'fail' }]), { isAsync: false });
    const result = await deserialize(Dto, {});
    expect(isBakerError(result)).toBe(true);
  });

  it('should return BakerErrors when async executor resolves to Err', async () => {
    const Dto = makeClass();
    attachSealed(Dto, () => Promise.resolve(err([{ path: 'x', code: 'fail' }])), { isAsync: true });
    const result = await deserialize(Dto, {});
    expect(isBakerError(result)).toBe(true);
  });

  it('should throw SealError when class is not sealed', () => {
    const Dto = makeClass('NotSealedDto');
    expect(() => deserialize(Dto, {})).toThrow(SealError);
  });
});
