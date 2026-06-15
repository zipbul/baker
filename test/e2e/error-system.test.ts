import { describe, it, expect, beforeEach, afterEach } from 'bun:test';

import { Baker, serialize, Field, BakerError } from '../../index';
import { unseal } from '../integration/helpers/unseal';

const baker = new Baker();

beforeEach(() => baker.seal());
afterEach(() => unseal());

@baker.Recipe
class MapDto {
  @Field({ type: () => Map }) m!: Map<unknown, unknown>;
}

describe('throw channel — serialize of a Map with a non-string key throws BakerError', () => {
  it('throws BakerError (not a raw TypeError) when a Map key is not a string', () => {
    const inst = new MapDto();
    inst.m = new Map<unknown, unknown>([[123, 'value']]);
    expect(() => serialize(inst)).toThrow(BakerError);
    expect(() => serialize(inst)).toThrow(/non-string key/);
  });

  it('serializes normally when all Map keys are strings', () => {
    const inst = new MapDto();
    inst.m = new Map<unknown, unknown>([['ok', 'value']]);
    expect(() => serialize(inst)).not.toThrow();
  });
});
