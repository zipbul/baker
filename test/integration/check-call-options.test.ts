import { describe, it, expect, beforeEach } from 'bun:test';

import type { RuntimeOptions } from '../../src/common/interfaces';

import { Baker, Field, BakerError } from '../../index';
import { isString } from '../../src/rules/index';

const baker = new Baker();

@baker.Recipe
class CallOptDto {
  @Field(isString) name!: string;
}

beforeEach(() => baker.seal());

/** Test-only wrappers: accept options as `unknown` so we can pass invalid options to exercise checkCallOptions. */
function deserializeBad<T>(cls: new (...args: never[]) => T, input: unknown, opts: unknown): unknown {
  return baker.deserialize(cls, input, opts as RuntimeOptions | undefined);
}
function serializeBad(instance: unknown, opts: unknown): unknown {
  return baker.serialize(instance, opts as RuntimeOptions | undefined);
}
function validateBad<T>(cls: new (...args: never[]) => T, input: unknown, opts: unknown): unknown {
  return baker.validate(cls, input, opts as RuntimeOptions | undefined);
}

describe('checkCallOptions — only `groups` is a valid per-call option', () => {
  it('deserialize with `groups` passes', () => {
    expect(() => baker.deserialize(CallOptDto, { name: 'x' }, { groups: ['a'] })).not.toThrow();
  });

  it('groups as a non-array throws BakerError', () => {
    // Untyped call boundary: a string would otherwise flow into `new Set(opts.groups)` and split into
    // characters in generated code, silently misbehaving instead of failing cleanly.
    expect(() => deserializeBad(CallOptDto, { name: 'x' }, { groups: 'admin' })).toThrow(/groups.*string\[\]/);
  });

  it('groups with a non-string element throws BakerError (dense array)', () => {
    expect(() => deserializeBad(CallOptDto, { name: 'x' }, { groups: ['a', 1] })).toThrow(/groups.*string\[\]/);
  });

  it('groups as a sparse array (holes only, no real elements) does not throw', () => {
    // Regression: the indexed validation loop must skip holes like `Array.prototype.some` did
    // (HasProperty check) — `new Array(1)` has no own index 0, so it must be accepted, not
    // rejected as "an array with a non-string element".
    expect(() => baker.deserialize(CallOptDto, { name: 'x' }, { groups: new Array(1) })).not.toThrow();
  });

  it('groups as an empty array is fine (no group filtering)', () => {
    expect(() => baker.deserialize(CallOptDto, { name: 'x' }, { groups: [] })).not.toThrow();
  });

  it('deserialize with unsupported per-call option throws BakerError', () => {
    expect(() => deserializeBad(CallOptDto, { name: 'x' }, { stopAtFirstError: true })).toThrow(BakerError);
  });

  it('serialize with unsupported per-call option throws BakerError', () => {
    const dto = Object.assign(new CallOptDto(), { name: 'x' });
    expect(() => serializeBad(dto, { autoConvert: true })).toThrow(BakerError);
  });

  it('validate with unsupported per-call option throws BakerError', () => {
    expect(() => validateBad(CallOptDto, { name: 'x' }, { forbidUnknown: true })).toThrow(BakerError);
  });

  it('multiple unsupported options listed in error', () => {
    try {
      deserializeBad(CallOptDto, { name: 'x' }, { stopAtFirstError: true, debug: true });
    } catch (e) {
      expect((e as Error).message).toMatch(/stopAtFirstError|debug/);
      return;
    }
    throw new Error('expected BakerError');
  });

  it('undefined options is fine', () => {
    expect(() => baker.deserialize(CallOptDto, { name: 'x' }, undefined)).not.toThrow();
  });

  it('non-object options throws BakerError', () => {
    expect(() => deserializeBad(CallOptDto, { name: 'x' }, 'oops')).toThrow(/must be a plain object/);
  });

  it('array options throws BakerError', () => {
    expect(() => deserializeBad(CallOptDto, { name: 'x' }, [])).toThrow(/must be a plain object/);
  });

  it('unknown per-call option key throws BakerError', () => {
    expect(() => deserializeBad(CallOptDto, { name: 'x' }, { totallyUnknownKey: 1 })).toThrow(/Unknown per-call option/);
  });

  it('Date instance is rejected', () => {
    expect(() => deserializeBad(CallOptDto, { name: 'x' }, new Date())).toThrow(/plain object/);
  });

  it('Map instance is rejected', () => {
    expect(() => deserializeBad(CallOptDto, { name: 'x' }, new Map())).toThrow(/plain object/);
  });

  it('class instance is rejected', () => {
    class Bag {
      groups = ['a'];
    }
    expect(() => deserializeBad(CallOptDto, { name: 'x' }, new Bag())).toThrow(/plain object/);
  });

  it('Object.create(null) is accepted (null prototype)', () => {
    const opts = Object.create(null);
    opts.groups = ['a'];
    expect(() => baker.deserialize(CallOptDto, { name: 'x' }, opts)).not.toThrow();
  });

  it('valid options are accepted despite an enumerable Object.prototype pollution', () => {
    // Regression: the key loop uses `for...in`, which walks inherited ENUMERABLE properties.
    // A user-added enumerable prop on Object.prototype must be ignored (hasOwn guard), not
    // rejected as an unknown per-call option.
    Object.defineProperty(Object.prototype, 'bakerPollutedTestKey', {
      value: 1,
      enumerable: true,
      configurable: true,
      writable: true,
    });
    try {
      expect(() => baker.deserialize(CallOptDto, { name: 'x' }, { groups: ['x'] })).not.toThrow();
    } finally {
      delete (Object.prototype as Record<string, unknown>).bakerPollutedTestKey;
    }
  });

  it('own unknown keys are still rejected under Object.prototype pollution', () => {
    // The hasOwn guard must only filter inherited keys — own keys keep Object.keys-equivalent behavior.
    Object.defineProperty(Object.prototype, 'bakerPollutedTestKey', {
      value: 1,
      enumerable: true,
      configurable: true,
      writable: true,
    });
    try {
      expect(() => deserializeBad(CallOptDto, { name: 'x' }, { totallyUnknownKey: 1 })).toThrow(
        /Unknown per-call option 'totallyUnknownKey'/,
      );
    } finally {
      delete (Object.prototype as Record<string, unknown>).bakerPollutedTestKey;
    }
  });
});
