import { describe, it, expect, afterEach } from 'bun:test';

import type { RuntimeOptions } from '../interfaces';

import { BakerError } from '../errors';
import { setSealed, deleteSealed } from '../meta-access';
import { globalRegistry } from '../registry';
import { resetForTesting } from '../seal/seal';
import { serialize } from './serialize';

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
  serializeFn: (instance: unknown, opts?: RuntimeOptions) => Record<string, unknown> | Promise<Record<string, unknown>>,
  opts?: { isSerializeAsync?: boolean },
): void {
  setSealed(ctor, {
    deserialize: () => {},
    serialize: serializeFn,
    validate: () => null,
    isAsync: false,
    isSerializeAsync: opts?.isSerializeAsync ?? false,
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

describe('serialize', () => {
  // ── Happy Path ─────────────────────────────────────────────────────────────

  it('should return Record when serialize returns plain object', async () => {
    // Arrange
    const Dto = makeClass();
    const record = { name: 'Alice' };
    attachSealed(Dto, () => record);
    const instance = new Dto();
    // Act
    const result = await serialize(instance);
    // Assert
    expect(result).toBe(record);
  });

  it('should pass instance and options to serialize when called', async () => {
    // Arrange
    const Dto = makeClass();
    let capturedInstance: unknown;
    let capturedOpts: RuntimeOptions | undefined;
    attachSealed(Dto, (inst, opts) => {
      capturedInstance = inst;
      capturedOpts = opts;
      return { name: 'x' };
    });
    const instance = new Dto();
    const opts: RuntimeOptions = { groups: ['public'] };
    // Act
    await serialize(instance, opts);
    // Assert
    expect(capturedInstance).toBe(instance);
    expect(capturedOpts).toBe(opts);
  });

  // ── Negative / Error ───────────────────────────────────────────────────────

  it('should throw BakerError when instance class has no [SEALED] executor', () => {
    // Arrange
    const Dto = makeClass('UnsealedDto');
    const instance = new Dto();
    // Act & Assert
    expect(() => serialize(instance)).toThrow(BakerError);
  });

  it('should include class name in BakerError message when not sealed', () => {
    // Arrange
    const Dto = makeClass('MySerializeDto');
    const instance = new Dto();
    // Act & Assert
    expect(() => serialize(instance)).toThrow('MySerializeDto');
  });

  // ── Edge ──────────────────────────────────────────────────────────────────

  it('should return empty object when serialize returns {} for instance with no registered fields', async () => {
    // Arrange
    const Dto = makeClass();
    attachSealed(Dto, () => ({}));
    const instance = new Dto();
    // Act
    const result = await serialize(instance);
    // Assert
    expect(result).toEqual({});
  });

  // ── State Transition ───────────────────────────────────────────────────────

  it('should work after sealed is re-attached following deletion', async () => {
    // Arrange
    const Dto = makeClass();
    const record1 = { a: 1 };
    const record2 = { b: 2 };
    attachSealed(Dto, () => record1);
    const instance = new Dto();
    await serialize(instance);
    // Simulate re-seal
    deleteSealed(Dto);
    attachSealed(Dto, () => record2);
    // Act
    const result = await serialize(instance);
    // Assert
    expect(result).toBe(record2);
  });

  // ── Idempotency ────────────────────────────────────────────────────────────

  it('should return identical Record on repeated calls with same instance', async () => {
    // Arrange
    const Dto = makeClass();
    const record = { name: 'Bob' };
    attachSealed(Dto, () => record);
    const instance = new Dto();
    // Act
    const r1 = await serialize(instance);
    const r2 = await serialize(instance);
    // Assert
    expect(r1).toBe(record);
    expect(r2).toBe(record);
    expect(r1).toBe(r2);
  });

  // ── Sync/Async branching ─────────────────────────────────────────────────

  it('should return direct value when isSerializeAsync is false', () => {
    // Arrange
    const Dto = makeClass();
    const record = { x: 1 };
    attachSealed(Dto, () => record, { isSerializeAsync: false });
    const instance = new Dto();
    // Act
    const result = serialize(instance);
    // Assert
    expect(result).toBe(record);
  });

  it('should use async path when isSerializeAsync is true', async () => {
    // Arrange
    const Dto = makeClass();
    const record = { y: 2 };
    setSealed(Dto, {
      deserialize: () => {},
      serialize: () => Promise.resolve(record),
      validate: () => null,
      isAsync: false,
      isSerializeAsync: true,
    });
    trackedClasses.push(Dto);
    const instance = new Dto();
    // Act
    const result = await serialize(instance);
    // Assert
    expect(result).toBe(record);
  });

  it('should throw BakerError when class is not sealed', () => {
    // Arrange
    const Dto = makeClass('NotSealedSerDto');
    const instance = new Dto();
    // Act & Assert
    expect(() => serialize(instance)).toThrow(BakerError);
  });
});
