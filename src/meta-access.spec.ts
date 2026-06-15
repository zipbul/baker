import { describe, it, expect } from 'bun:test';

import { deleteRaw, getRaw, hasRawOwn, requireRaw, setRaw } from './meta-access';

function fresh(): Function {
  return class Anon {};
}

describe('meta-access', () => {
  describe('RAW slot', () => {
    it('roundtrips via setRaw/getRaw', () => {
      const cls = fresh();
      const raw = {};
      setRaw(cls, raw);
      expect(getRaw(cls)).toBe(raw);
    });

    it('hasRawOwn returns true after setRaw, false after deleteRaw', () => {
      const cls = fresh();
      expect(hasRawOwn(cls)).toBe(false);
      setRaw(cls, {});
      expect(hasRawOwn(cls)).toBe(true);
      deleteRaw(cls);
      expect(hasRawOwn(cls)).toBe(false);
    });

    it('requireRaw returns the metadata when present', () => {
      const cls = fresh();
      const raw = { x: 1 };
      setRaw(cls, raw as never);
      expect(requireRaw(cls)).toBe(raw as never);
    });

    it('requireRaw throws when slot is empty', () => {
      const cls = fresh();
      expect(() => requireRaw(cls)).toThrow(/no @Field/);
    });

    it('hasRawOwn is false for a child that inherits the parent metadata via the class prototype chain', () => {
      class Parent {}
      setRaw(Parent, { x: {} } as never);
      class Child extends Parent {}
      // Child has no own RAW; Child[Symbol.metadata] resolves to Parent's via the class proto chain.
      // hasRawOwn must still report false so mergeInheritance does not double-count the parent.
      expect(hasRawOwn(Child)).toBe(false);
      expect(hasRawOwn(Parent)).toBe(true);
    });

    it('setRaw on a child does not pollute the parent metadata slot', () => {
      class Parent {}
      const parentRaw = { p: {} };
      setRaw(Parent, parentRaw as never);
      class Child extends Parent {}
      setRaw(Child, { c: {} } as never);
      expect(getRaw(Parent)).toBe(parentRaw as never);
      expect(hasRawOwn(Child)).toBe(true);
      expect(getRaw(Child)).not.toBe(parentRaw as never);
    });
  });
});
