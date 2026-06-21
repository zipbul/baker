import { describe, it, expect } from 'bun:test';

import type { RawClassMeta } from './interfaces';

import { RAW } from '../symbols';
import { metaStore } from './meta-store';

function rawWith(key: string): RawClassMeta {
  return { [key]: { validation: [], transform: [], expose: [], exclude: null, type: null, flags: {} } };
}

describe('MetaStore — get / set', () => {
  it('returns the raw metadata set on a class', () => {
    class A {}
    const raw = rawWith('name');
    metaStore.set(A, raw);
    expect(metaStore.get(A)).toBe(raw);
  });

  it('returns undefined for a class with no metadata', () => {
    class B {}
    expect(metaStore.get(B)).toBeUndefined();
  });
});

describe('MetaStore — require', () => {
  it('returns the raw metadata when present', () => {
    class C {}
    const raw = rawWith('x');
    metaStore.set(C, raw);
    expect(metaStore.require(C)).toBe(raw);
  });

  it('throws when the class has no @Field decorators', () => {
    class D {}
    expect(() => metaStore.require(D)).toThrow(/no @Field decorators/);
  });
});

describe('MetaStore — delete', () => {
  it('removes the raw metadata so get returns undefined', () => {
    class E {}
    metaStore.set(E, rawWith('y'));
    metaStore.delete(E);
    expect(metaStore.get(E)).toBeUndefined();
  });

  it('is a no-op for a class that never had metadata', () => {
    class F {}
    expect(() => metaStore.delete(F)).not.toThrow();
  });
});

describe('MetaStore — hasOwn', () => {
  it('returns true for a class with its own RAW slot', () => {
    class G {}
    metaStore.set(G, rawWith('z'));
    expect(metaStore.hasOwn(G)).toBe(true);
  });

  it('returns false for a class with no metadata', () => {
    class H {}
    expect(metaStore.hasOwn(H)).toBe(false);
  });

  it('returns false for a subclass that only inherits the parent RAW via the prototype chain', () => {
    class Parent {}
    metaStore.set(Parent, rawWith('p'));
    class Child extends Parent {}
    // get walks the chain and finds the parent's RAW, but hasOwn must report false (no OWN slot).
    expect(metaStore.get(Child)).toBeDefined();
    expect(metaStore.hasOwn(Child)).toBe(false);
  });
});

describe('MetaStore — ensure', () => {
  it('creates the RAW slot and a default per-key meta on a fresh metadata object', () => {
    const metadata: Record<PropertyKey, unknown> = {};
    const m = metaStore.ensure(metadata, 'field');
    expect(m).toEqual({ validation: [], transform: [], expose: [], exclude: null, type: null, flags: {} });
  });

  it('returns the same meta object on repeated calls for the same key', () => {
    const metadata: Record<PropertyKey, unknown> = {};
    const first = metaStore.ensure(metadata, 'field');
    const second = metaStore.ensure(metadata, 'field');
    expect(second).toBe(first);
  });

  it('creates a fresh own RAW on a child metadata object rather than polluting the inherited parent RAW', () => {
    const parent: Record<PropertyKey, unknown> = {};
    metaStore.ensure(parent, 'parentField');
    const child: Record<PropertyKey, unknown> = Object.create(parent);
    metaStore.ensure(child, 'childField');
    const parentRaw = parent[RAW] as RawClassMeta;
    const childRaw = child[RAW] as RawClassMeta;
    expect(childRaw).not.toBe(parentRaw); // own slot, not the inherited one
    expect('childField' in parentRaw).toBe(false); // child write did not leak into parent
  });
});
