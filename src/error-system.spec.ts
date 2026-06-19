import { describe, it, expect } from 'bun:test';

import { createRule } from './create-rule';
import { BakerError } from './common/errors';
import { isPassportNumber } from './rules/locales';
import { isDivisibleBy, max, min } from './rules/number';

// Every developer-misuse condition discoverable WITHOUT external input must throw the single
// throw-channel class `BakerError` (never a bare Error/TypeError). These all throw at
// rule-factory call time or first rule invocation.

describe('throw channel — createRule misuse throws BakerError', () => {
  it('throws when the validate function is missing', () => {
    expect(() => (createRule as (n: unknown) => unknown)({ name: 'noValidate' })).toThrow(BakerError);
    expect(() => (createRule as (n: unknown) => unknown)({ name: 'noValidate' })).toThrow(/validate function is required/);
  });

  it('throws when a sync rule returns a Promise (on invocation)', () => {
    const rule = createRule('syncPromise', () => Promise.resolve(true));
    expect(() => rule('value')).toThrow(BakerError);
    expect(() => rule('value')).toThrow(/sync rule returned Promise/);
  });
});

describe('throw channel — numeric rule factory misuse throws BakerError', () => {
  it('min(NaN) throws (non-finite bound)', () => {
    expect(() => min(Number.NaN)).toThrow(BakerError);
    expect(() => min(Number.NaN)).toThrow(/finite number/);
  });

  it('max(Infinity) throws (non-finite bound)', () => {
    expect(() => max(Number.POSITIVE_INFINITY)).toThrow(BakerError);
    expect(() => max(Number.POSITIVE_INFINITY)).toThrow(/finite number/);
  });

  it('isDivisibleBy(0) throws (zero divisor)', () => {
    expect(() => isDivisibleBy(0)).toThrow(BakerError);
    expect(() => isDivisibleBy(0)).toThrow(/divisor must not be zero/);
  });
});

describe('throw channel — locale rule factory misuse throws BakerError', () => {
  it('isPassportNumber with an unsupported locale throws', () => {
    expect(() => isPassportNumber('ZZ')).toThrow(BakerError);
    expect(() => isPassportNumber('ZZ')).toThrow(/Unsupported locale/);
  });
});
