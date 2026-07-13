import { describe, it, expect } from 'bun:test';

import type { RuntimeOptions } from '../common/interfaces';
import type { SealedExecutors } from '../seal/interfaces';

import { assertBakerIssueSet } from '../../test/integration/helpers/assert';
import { Baker } from '../baker';
import { isBakerIssueSet, BakerError } from '../common/errors';
import { Field } from '../decorators/field';
import { isString } from '../rules/typechecker';
import { runDeserialize } from './deserialize';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — build a minimal SealedExecutors to drive runDeserialize's dispatch.
// runDeserialize takes a sealed executor directly (the Baker resolves it from its map);
// these specs exercise that post-resolution dispatch in isolation.
// ─────────────────────────────────────────────────────────────────────────────

function sealedFor(
  deserializeFn: (input: unknown, opts?: RuntimeOptions) => unknown,
  opts?: { isAsync?: boolean },
): SealedExecutors<unknown> {
  return {
    deserialize: deserializeFn as never,
    serialize: () => ({}),
    validate: () => null,
    isAsync: opts?.isAsync ?? false,
    isSerializeAsync: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests — runDeserialize dispatch
// ─────────────────────────────────────────────────────────────────────────────

describe('runDeserialize', () => {
  // ── Happy Path ─────────────────────────────────────────────────────────────

  it('should return T instance when deserialize returns valid value', async () => {
    const instance = { name: 'Alice' };
    const result = await runDeserialize(
      sealedFor(() => instance),
      { name: 'Alice' },
    );
    expect(isBakerIssueSet(result)).toBe(false);
    expect(result).toBe(instance);
  });

  it('should pass options to deserialize when RuntimeOptions provided', async () => {
    let capturedOpts: RuntimeOptions | undefined;
    const opts: RuntimeOptions = { groups: ['admin'] };
    await runDeserialize(
      sealedFor((_input, o) => {
        capturedOpts = o;
        return {};
      }),
      {},
      opts,
    );
    expect(capturedOpts).toBe(opts);
  });

  it('should pass input to deserialize when called with object input', async () => {
    let capturedInput: unknown;
    const payload = { name: 'Bob', extra: 'ignored' };
    await runDeserialize(
      sealedFor(input => {
        capturedInput = input;
        return {};
      }),
      payload,
    );
    expect(capturedInput).toBe(payload);
  });

  // ── Negative / Error ───────────────────────────────────────────────────────

  it('should return BakerIssueSet when deserialize returns Err', async () => {
    const errors = [{ path: 'name', code: 'isString' }];
    const result = await runDeserialize(
      sealedFor(() => errors),
      { name: 42 },
    );
    expect(isBakerIssueSet(result)).toBe(true);
  });

  it('should attach errors array to BakerIssueSet when deserialize fails', async () => {
    const errors = [
      { path: 'name', code: 'isString' },
      { path: 'email', code: 'isEmail' },
    ];
    const result = await runDeserialize(
      sealedFor(() => errors),
      {},
    );
    assertBakerIssueSet(result);
    expect(result.errors).toEqual(errors);
  });

  it('should return BakerIssueSet(code:invalidInput) when deserialize returns invalidInput error', async () => {
    const result = await runDeserialize(
      sealedFor(() => [{ path: '', code: 'invalidInput' }]),
      null,
    );
    assertBakerIssueSet(result);
    expect(result.errors[0]!.code).toBe('invalidInput');
  });

  it('should return BakerIssueSet when deserialize returns Err for array input', async () => {
    const result = await runDeserialize(
      sealedFor(() => [{ path: '', code: 'invalidInput' }]),
      [1, 2, 3],
    );
    expect(isBakerIssueSet(result)).toBe(true);
  });

  // ── Edge ──────────────────────────────────────────────────────────────────

  it('should return T when deserialize succeeds with empty {} input for class with no fields', async () => {
    const instance = {};
    const result = await runDeserialize(
      sealedFor(() => instance),
      {},
    );
    expect(result).toBe(instance);
  });

  // ── Idempotency ────────────────────────────────────────────────────────────

  it('should return independent T instances on repeated calls with same input', async () => {
    let idx = 0;
    const inst0 = { id: 0 };
    const inst1 = { id: 1 };
    const instances = [inst0, inst1] as const;
    const sealed = sealedFor(() => instances[idx++]);
    const input = { name: 'Alice' };
    const r1 = await runDeserialize(sealed, input);
    const r2 = await runDeserialize(sealed, input);
    expect(r1).toBe(inst0);
    expect(r2).toBe(inst1);
  });

  // ── Sync/Async branching ─────────────────────────────────────────────────

  it('should return direct value when isAsync is false', () => {
    const instance = {};
    const result = runDeserialize(
      sealedFor(() => instance, { isAsync: false }),
      {},
    );
    expect(result).toBe(instance);
  });

  it('should use async path when isAsync is true', async () => {
    const instance = {};
    const result = await runDeserialize(
      sealedFor(() => Promise.resolve(instance), { isAsync: true }),
      {},
    );
    expect(result).toBe(instance);
  });

  it('should return BakerIssueSet when sync executor returns Err', async () => {
    const result = await runDeserialize(
      sealedFor(() => [{ path: 'x', code: 'fail' }], { isAsync: false }),
      {},
    );
    expect(isBakerIssueSet(result)).toBe(true);
  });

  it('should return BakerIssueSet when async executor resolves to Err', async () => {
    const result = await runDeserialize(
      sealedFor(() => Promise.resolve([{ path: 'x', code: 'fail' }]), { isAsync: true }),
      {},
    );
    expect(isBakerIssueSet(result)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Resolution boundary — a class not sealed by the baker throws (was the global
// "no [SEALED] executor" path; resolution now lives on the Baker).
// ─────────────────────────────────────────────────────────────────────────────

describe('Baker.deserialize resolution', () => {
  it('should throw BakerError when class is not sealed by this baker', () => {
    const baker = new Baker();
    class UnsealedDto {
      @Field(isString) name!: string;
    }
    expect(() => baker.deserialize(UnsealedDto, {})).toThrow(BakerError);
  });

  it('should include class name in BakerError message when not sealed', () => {
    const baker = new Baker();
    class MyDto {
      @Field(isString) name!: string;
    }
    let caught: BakerError | undefined;
    try {
      baker.deserialize(MyDto, {});
    } catch (e) {
      caught = e as BakerError;
    }
    expect(caught).toBeInstanceOf(BakerError);
    expect(caught!.message).toContain('MyDto');
  });
});
