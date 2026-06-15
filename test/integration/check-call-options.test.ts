import { describe, it, expect, beforeEach } from 'bun:test';

import type { RuntimeOptions } from '../../src/interfaces';

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
});
