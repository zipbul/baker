import { describe, it, expect, beforeEach, afterEach } from 'bun:test';

import { Field, deserialize, serialize, validate, SealError, seal } from '../../index';
import { isString } from '../../src/rules/index';
import { unseal } from './helpers/unseal';

class CallOptDto {
  @Field(isString) name!: string;
}

beforeEach(() => seal());
afterEach(() => unseal());

describe('checkCallOptions — only `groups` is a valid per-call option', () => {
  it('deserialize with `groups` passes', () => {
    expect(() => deserialize(CallOptDto, { name: 'x' }, { groups: ['a'] })).not.toThrow();
  });

  it('deserialize with unsupported per-call option throws SealError', () => {
    expect(() => deserialize(CallOptDto, { name: 'x' }, { stopAtFirstError: true } as any)).toThrow(SealError);
  });

  it('serialize with unsupported per-call option throws SealError', () => {
    const dto = Object.assign(new CallOptDto(), { name: 'x' });
    expect(() => serialize(dto, { autoConvert: true } as any)).toThrow(SealError);
  });

  it('validate with unsupported per-call option throws SealError', () => {
    expect(() => validate(CallOptDto, { name: 'x' }, { forbidUnknown: true } as any)).toThrow(SealError);
  });

  it('multiple unsupported options listed in error', () => {
    try {
      deserialize(CallOptDto, { name: 'x' }, { stopAtFirstError: true, debug: true } as any);
    } catch (e) {
      expect((e as Error).message).toMatch(/stopAtFirstError|debug/);
      return;
    }
    throw new Error('expected SealError');
  });

  it('undefined options is fine', () => {
    expect(() => deserialize(CallOptDto, { name: 'x' }, undefined)).not.toThrow();
  });

  it('non-object options throws SealError', () => {
    expect(() => deserialize(CallOptDto, { name: 'x' }, 'oops' as any)).toThrow(/must be a plain object/);
  });

  it('array options throws SealError', () => {
    expect(() => deserialize(CallOptDto, { name: 'x' }, [] as any)).toThrow(/must be a plain object/);
  });

  it('unknown per-call option key throws SealError', () => {
    expect(() => deserialize(CallOptDto, { name: 'x' }, { totallyUnknownKey: 1 } as any)).toThrow(/Unknown per-call option/);
  });

  it('Date instance is rejected', () => {
    expect(() => deserialize(CallOptDto, { name: 'x' }, new Date() as any)).toThrow(/plain object/);
  });

  it('Map instance is rejected', () => {
    expect(() => deserialize(CallOptDto, { name: 'x' }, new Map() as any)).toThrow(/plain object/);
  });

  it('class instance is rejected', () => {
    class Bag {
      groups = ['a'];
    }
    expect(() => deserialize(CallOptDto, { name: 'x' }, new Bag() as any)).toThrow(/plain object/);
  });

  it('Object.create(null) is accepted (null prototype)', () => {
    const opts = Object.create(null);
    opts.groups = ['a'];
    expect(() => deserialize(CallOptDto, { name: 'x' }, opts)).not.toThrow();
  });
});
