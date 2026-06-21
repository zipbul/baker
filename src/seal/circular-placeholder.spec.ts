import { describe, it, expect } from 'bun:test';

import { BakerError } from '../common';
import { CircularPlaceholder } from './circular-placeholder';

describe('CircularPlaceholder', () => {
  it('reports non-async flags', () => {
    const p = new CircularPlaceholder('MyDto');
    expect(p.isAsync).toBe(false);
    expect(p.isSerializeAsync).toBe(false);
  });

  it('throws a BakerError naming the still-sealing class from every executor member', () => {
    const p = new CircularPlaceholder('MyDto');
    expect(() => p.deserialize({})).toThrow(BakerError);
    expect(() => p.serialize({})).toThrow(/MyDto is still being sealed/);
    expect(() => p.validate({})).toThrow(/MyDto/);
  });

  it('exposes executor members as writable own fields so seal can replace them in place', () => {
    const p = new CircularPlaceholder('X');
    // Reference identity is load-bearing: nested refs already hold this object, so sealOne replaces the
    // members via Object.assign rather than swapping the instance.
    expect(Object.hasOwn(p, 'deserialize')).toBe(true);
    Object.assign(p, { deserialize: () => 'ok' });
    expect((p.deserialize as unknown as () => string)()).toBe('ok');
  });
});
