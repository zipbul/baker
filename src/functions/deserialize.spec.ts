import { describe, it, expect, afterEach, mock } from 'bun:test';
import { err } from '@zipbul/result';
import { SEALED } from '../symbols';
import { isBakerError, SealError } from '../errors';
import type { BakerErrors } from '../errors';
import { globalRegistry } from '../registry';
import { _resetForTesting } from '../seal/seal';
import { deserialize } from './deserialize';
import type { RuntimeOptions } from '../interfaces';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const trackedClasses: Function[] = [];

function makeClass(name = 'TestDto'): new (...args: any[]) => any {
  const ctor = class {} as any;
  Object.defineProperty(ctor, 'name', { value: name });
  trackedClasses.push(ctor);
  return ctor;
}

function attachSealed(
  ctor: Function,
  deserializeFn: (input: unknown, opts?: RuntimeOptions) => unknown,
  opts?: { isAsync?: boolean },
): void {
  (ctor as any)[SEALED] = {
    _deserialize: deserializeFn,
    _serialize: () => ({}),
    _isAsync: opts?.isAsync ?? false,
    _isSerializeAsync: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cleanup
// ─────────────────────────────────────────────────────────────────────────────

afterEach(() => {
  for (const ctor of trackedClasses) {
    globalRegistry.delete(ctor);
    delete (ctor as any)[SEALED];
  }
  trackedClasses.length = 0;
  _resetForTesting();
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('deserialize', () => {
  // ── Happy Path ─────────────────────────────────────────────────────────────

  it('should return T instance when _deserialize returns valid value', async () => {
    const Dto = makeClass();
    const instance = new Dto();
    attachSealed(Dto, () => instance);
    const result = await deserialize(Dto, { name: 'Alice' });
    expect(isBakerError(result)).toBe(false);
    expect(result).toBe(instance);
  });

  it('should pass options to _deserialize when RuntimeOptions provided', async () => {
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

  it('should pass input to _deserialize when called with object input', async () => {
    const Dto = makeClass();
    const instance = new Dto();
    let capturedInput: unknown;
    attachSealed(Dto, (input) => {
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

  it('should include class name in SealError message when not sealed', async () => {
    const Dto = makeClass('MyDto');
    let caught: SealError | undefined;
    try {
      await deserialize(Dto, {});
    } catch (e) {
      caught = e as SealError;
    }
    expect(caught).toBeInstanceOf(SealError);
    expect(caught!.message).toContain('MyDto');
  });

  it('should return BakerErrors when _deserialize returns Err', async () => {
    const Dto = makeClass();
    const errors = [{ path: 'name', code: 'isString' }];
    attachSealed(Dto, () => err(errors));
    const result = await deserialize(Dto, { name: 42 });
    expect(isBakerError(result)).toBe(true);
  });

  it('should attach errors array to BakerErrors when _deserialize fails', async () => {
    const Dto = makeClass();
    const errors = [{ path: 'name', code: 'isString' }, { path: 'email', code: 'isEmail' }];
    attachSealed(Dto, () => err(errors));
    const result = await deserialize(Dto, {});
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors).toEqual(errors);
    }
  });

  it('should return BakerErrors(code:invalidInput) when _deserialize returns invalidInput error', async () => {
    const Dto = makeClass();
    attachSealed(Dto, () => err([{ path: '', code: 'invalidInput' }]));
    const result = await deserialize(Dto, null);
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors[0]!.code).toBe('invalidInput');
    }
  });

  it('should return BakerErrors when _deserialize returns Err for array input', async () => {
    const Dto = makeClass();
    attachSealed(Dto, () => err([{ path: '', code: 'invalidInput' }]));
    const result = await deserialize(Dto, [1, 2, 3]);
    expect(isBakerError(result)).toBe(true);
  });

  // ── Edge ──────────────────────────────────────────────────────────────────

  it('should return T when _deserialize succeeds with empty {} input for class with no fields', async () => {
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
    delete (Dto as any)[SEALED];
    attachSealed(Dto, () => instance2);
    const result = await deserialize(Dto, {});
    expect(result).toBe(instance2);
  });

  // ── Idempotency ────────────────────────────────────────────────────────────

  it('should return independent T instances on repeated calls with same input', async () => {
    const Dto = makeClass();
    let idx = 0;
    const instances = [new Dto(), new Dto()];
    attachSealed(Dto, () => instances[idx++]);
    const input = { name: 'Alice' };
    const r1 = await deserialize(Dto, input);
    const r2 = await deserialize(Dto, input);
    expect(r1).toBe(instances[0]);
    expect(r2).toBe(instances[1]);
  });

  // ── Sync/Async branching ─────────────────────────────────────────────────

  it('should return value directly when _isAsync is false', () => {
    const Dto = makeClass();
    const instance = new Dto();
    attachSealed(Dto, () => instance, { isAsync: false });
    const result = deserialize(Dto, {});
    expect(result).not.toBeInstanceOf(Promise);
    expect(result).toBe(instance);
  });

  it('should use async path when _isAsync is true', async () => {
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
