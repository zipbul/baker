import { describe, it, expect } from 'bun:test';
import { isBakerError, BAKER_ERROR, SealError, _toBakerErrors } from './errors';
import type { BakerError, BakerErrors } from './errors';

describe('isBakerError', () => {
  it('should return true for object with BAKER_ERROR symbol', () => {
    const obj = { [BAKER_ERROR]: true as const, errors: [] };
    expect(isBakerError(obj)).toBe(true);
  });

  it('should return true for BakerErrors created via _toBakerErrors', () => {
    const errors: BakerError[] = [{ path: 'name', code: 'isString' }];
    const result = _toBakerErrors(errors);
    expect(isBakerError(result)).toBe(true);
  });

  it('should return false for plain object without BAKER_ERROR symbol', () => {
    expect(isBakerError({ errors: [] })).toBe(false);
  });

  it('should return false for null', () => {
    expect(isBakerError(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isBakerError(undefined)).toBe(false);
  });

  it('should return false for primitive string', () => {
    expect(isBakerError('error')).toBe(false);
  });

  it('should return false for primitive number', () => {
    expect(isBakerError(42)).toBe(false);
  });

  it('should return false for Error instance', () => {
    expect(isBakerError(new Error('fail'))).toBe(false);
  });

  it('should return false for array', () => {
    expect(isBakerError([{ path: '', code: 'isString' }])).toBe(false);
  });

  it('should return false for Promise', () => {
    expect(isBakerError(Promise.resolve(true))).toBe(false);
  });

  it('should return false for class instance without BAKER_ERROR', () => {
    class Foo { errors = []; }
    expect(isBakerError(new Foo())).toBe(false);
  });

  it('should return false for boolean true', () => {
    expect(isBakerError(true)).toBe(false);
  });

  it('should return false for boolean false', () => {
    expect(isBakerError(false)).toBe(false);
  });

  it('should expose errors array when narrowed via isBakerError', () => {
    const errors: BakerError[] = [
      { path: 'name', code: 'isString' },
      { path: 'email', code: 'isEmail' },
    ];
    const result: unknown = _toBakerErrors(errors);
    if (isBakerError(result)) {
      expect(result.errors).toEqual(errors);
      expect(result.errors).toHaveLength(2);
    } else {
      expect.unreachable();
    }
  });

  it('should return true for BakerErrors with empty errors array', () => {
    const result = _toBakerErrors([]);
    expect(isBakerError(result)).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe('SealError', () => {
  it('should be constructable when given a message string', () => {
    const err = new SealError('not sealed: Foo');
    expect(err).toBeDefined();
  });

  it("should have name 'SealError' when accessing .name", () => {
    const err = new SealError('not sealed: Foo');
    expect(err.name).toBe('SealError');
  });

  it('should expose the passed message when accessing .message', () => {
    const msg = 'already sealed: seal() must be called exactly once';
    const err = new SealError(msg);
    expect(err.message).toBe(msg);
  });
});
