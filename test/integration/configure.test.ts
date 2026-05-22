import { describe, it, expect, afterEach, beforeEach } from 'bun:test';

import { configure, SealError } from '../../index';
import { getGlobalOptions } from '../../src/configure';
import { unseal } from './helpers/unseal';

beforeEach(() => unseal());
afterEach(() => unseal());

/** Test-only wrapper: configure accepts a strict SealOptions, but we want to feed it garbage to test rejection. */
function configureBad(c: unknown): void {
  (configure as (c: unknown) => void)(c);
}

describe('configure() — input validation', () => {
  it('configure(null) throws SealError', () => {
    expect(() => configureBad(null)).toThrow(SealError);
    expect(() => configureBad(null)).toThrow(/requires a plain object/);
  });

  it('configure(undefined) throws SealError', () => {
    expect(() => configureBad(undefined)).toThrow(SealError);
  });

  it('configure("string") throws SealError', () => {
    expect(() => configureBad('hello')).toThrow(SealError);
  });

  it('configure([]) throws SealError', () => {
    expect(() => configureBad([])).toThrow(/Received: array/);
  });

  it('configure({unknownKey}) throws SealError listing valid keys', () => {
    expect(() => configureBad({ unknownKey: 1 })).toThrow(/unknown key 'unknownKey'/);
    expect(() => configureBad({ unknownKey: 1 })).toThrow(/Valid keys: autoConvert/);
  });

  it('configure({autoConvert: true}) accepts known key', () => {
    expect(() => configure({ autoConvert: true })).not.toThrow();
  });

  it('configure({}) accepts empty object', () => {
    expect(() => configure({})).not.toThrow();
  });
});

describe('getGlobalOptions — frozen', () => {
  it('returns a frozen options object on default state', () => {
    expect(Object.isFrozen(getGlobalOptions())).toBe(true);
  });

  it('returns a frozen options object after configure()', () => {
    configure({ stopAtFirstError: true });
    const opts = getGlobalOptions();
    expect(Object.isFrozen(opts)).toBe(true);
    expect(() => {
      (opts as { stopAtFirstError?: boolean }).stopAtFirstError = false;
    }).toThrow();
  });
});
