import { describe, it, expect } from 'bun:test';

import type { BakerIssue } from './errors';

import { assertBakerIssueSet } from '../../test/integration/helpers/assert';
import { isBakerIssueSet, BAKER_ERROR, BakerError, toBakerIssueSet } from './errors';

describe('isBakerIssueSet', () => {
  it('should return true for object with BAKER_ERROR symbol', () => {
    const obj = { [BAKER_ERROR]: true as const, errors: [] };
    expect(isBakerIssueSet(obj)).toBe(true);
  });

  it('should return true for BakerIssueSet created via toBakerIssueSet', () => {
    const errors: BakerIssue[] = [{ path: 'name', code: 'isString' }];
    const result = toBakerIssueSet(errors);
    expect(isBakerIssueSet(result)).toBe(true);
  });

  it('should return false for plain object without BAKER_ERROR symbol', () => {
    expect(isBakerIssueSet({ errors: [] })).toBe(false);
  });

  it('should return false for null', () => {
    expect(isBakerIssueSet(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isBakerIssueSet(undefined)).toBe(false);
  });

  it('should return false for primitive string', () => {
    expect(isBakerIssueSet('error')).toBe(false);
  });

  it('should return false for primitive number', () => {
    expect(isBakerIssueSet(42)).toBe(false);
  });

  it('should return false for Error instance', () => {
    expect(isBakerIssueSet(new Error('fail'))).toBe(false);
  });

  it('should return false for a thrown BakerError instance (throw channel is not the result channel)', () => {
    expect(isBakerIssueSet(new BakerError('boom'))).toBe(false);
  });

  it('should return false for array', () => {
    expect(isBakerIssueSet([{ path: '', code: 'isString' }])).toBe(false);
  });

  it('should return false for Promise', () => {
    expect(isBakerIssueSet(Promise.resolve(true))).toBe(false);
  });

  it('should return false for class instance without BAKER_ERROR', () => {
    class Foo {
      errors = [];
    }
    expect(isBakerIssueSet(new Foo())).toBe(false);
  });

  it('should return false for boolean true', () => {
    expect(isBakerIssueSet(true)).toBe(false);
  });

  it('should return false for boolean false', () => {
    expect(isBakerIssueSet(false)).toBe(false);
  });

  it('should expose errors array when narrowed via isBakerIssueSet', () => {
    const errors: BakerIssue[] = [
      { path: 'name', code: 'isString' },
      { path: 'email', code: 'isEmail' },
    ];
    const result: unknown = toBakerIssueSet(errors);
    assertBakerIssueSet(result);
    expect(result.errors).toEqual(errors);
    expect(result.errors).toHaveLength(2);
  });

  it('should return true for BakerIssueSet with empty errors array', () => {
    const result = toBakerIssueSet([]);
    expect(isBakerIssueSet(result)).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe('BakerError (throw channel)', () => {
  it('should be an Error subclass', () => {
    expect(new BakerError('boom')).toBeInstanceOf(Error);
  });

  it("should have name 'BakerError' when accessing .name", () => {
    const err = new BakerError('not sealed: Foo');
    expect(err.name).toBe('BakerError');
  });

  it('should expose the passed message when accessing .message', () => {
    const msg = 'UserDto is not sealed';
    const err = new BakerError(msg);
    expect(err.message).toBe(msg);
  });

  it('should default .cause to undefined when no options are given', () => {
    expect(new BakerError('boom').cause).toBeUndefined();
  });

  it('should preserve the original error as .cause when provided', () => {
    const original = new Error('underlying');
    const err = new BakerError('wrapped', { cause: original });
    expect(err.cause).toBe(original);
  });

  it('should accept a non-Error cause value', () => {
    const err = new BakerError('wrapped', { cause: 'raw string cause' });
    expect(err.cause).toBe('raw string cause');
  });
});
