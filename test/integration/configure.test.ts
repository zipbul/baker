import { describe, it, expect } from 'bun:test';

import { Baker, BakerError } from '../../index';

describe('new Baker(config) — input validation', () => {
  it('new Baker(null) throws BakerError', () => {
    expect(() => new Baker(null as never)).toThrow(BakerError);
    expect(() => new Baker(null as never)).toThrow(/requires a plain object/);
  });

  it('new Baker("string") throws BakerError', () => {
    expect(() => new Baker('hello' as never)).toThrow(BakerError);
  });

  it('new Baker([]) throws BakerError', () => {
    expect(() => new Baker([] as never)).toThrow(/Received: array/);
  });

  it('new Baker({unknownKey}) throws BakerError listing valid keys', () => {
    expect(() => new Baker({ unknownKey: 1 } as never)).toThrow(/unknown key 'unknownKey'/);
    expect(() => new Baker({ unknownKey: 1 } as never)).toThrow(/Valid keys: autoConvert/);
  });

  it('new Baker({autoConvert: true}) accepts known key', () => {
    expect(() => new Baker({ autoConvert: true })).not.toThrow();
  });

  it('new Baker({}) accepts empty object', () => {
    expect(() => new Baker({})).not.toThrow();
  });

  it('new Baker() (no argument) is valid', () => {
    expect(() => new Baker()).not.toThrow();
  });
});
