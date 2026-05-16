import { describe, it, expect, afterEach, beforeEach } from 'bun:test';

import { configure, SealError } from '../../index';
import { unseal } from './helpers/unseal';

beforeEach(() => unseal());
afterEach(() => unseal());

describe('configure() — input validation', () => {
  it('configure(null) throws SealError', () => {
    expect(() => (configure as unknown as (c: unknown) => void)(null)).toThrow(SealError);
    expect(() => (configure as unknown as (c: unknown) => void)(null)).toThrow(/requires a plain object/);
  });

  it('configure(undefined) throws SealError', () => {
    expect(() => (configure as unknown as (c: unknown) => void)(undefined)).toThrow(SealError);
  });

  it('configure("string") throws SealError', () => {
    expect(() => (configure as unknown as (c: unknown) => void)('hello')).toThrow(SealError);
  });

  it('configure([]) throws SealError', () => {
    expect(() => (configure as unknown as (c: unknown) => void)([])).toThrow(/Received: array/);
  });

  it('configure({unknownKey}) throws SealError listing valid keys', () => {
    expect(() => (configure as unknown as (c: unknown) => void)({ unknownKey: 1 })).toThrow(/unknown key 'unknownKey'/);
    expect(() => (configure as unknown as (c: unknown) => void)({ unknownKey: 1 })).toThrow(/Valid keys: autoConvert/);
  });

  it('configure({autoConvert: true}) accepts known key', () => {
    expect(() => configure({ autoConvert: true })).not.toThrow();
  });

  it('configure({}) accepts empty object', () => {
    expect(() => configure({})).not.toThrow();
  });
});
