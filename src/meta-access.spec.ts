import { describe, it, expect } from 'bun:test';

import type { SealedExecutors } from './types';

import {
  deleteRaw,
  deleteSealed,
  freezeRaw,
  getRaw,
  getSealed,
  hasRawOwn,
  hasSealedOwn,
  requireRaw,
  requireSealed,
  setRaw,
  setSealed,
} from './meta-access';

function fresh(): Function {
  return class Anon {};
}

function mockExec(): SealedExecutors<unknown> {
  return {
    deserialize: () => ({ ok: true, data: {} }) as never,
    serialize: () => ({}),
    validate: () => null,
    isAsync: false,
    isSerializeAsync: false,
  };
}

describe('meta-access', () => {
  describe('SEALED slot', () => {
    it('roundtrips via setSealed/getSealed', () => {
      const cls = fresh();
      const exec = mockExec();
      setSealed(cls, exec);
      expect(getSealed(cls)).toBe(exec);
    });

    it('hasSealedOwn returns true after setSealed, false after deleteSealed', () => {
      const cls = fresh();
      expect(hasSealedOwn(cls)).toBe(false);
      setSealed(cls, mockExec());
      expect(hasSealedOwn(cls)).toBe(true);
      deleteSealed(cls);
      expect(hasSealedOwn(cls)).toBe(false);
    });

    it('requireSealed returns the executor when present', () => {
      const cls = fresh();
      const exec = mockExec();
      setSealed(cls, exec);
      expect(requireSealed(cls)).toBe(exec);
    });

    it('requireSealed throws when slot is empty', () => {
      const cls = fresh();
      expect(() => requireSealed(cls)).toThrow(/not sealed/);
    });
  });

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

    it('freezeRaw freezes the RAW metadata object', () => {
      const cls = fresh();
      const raw = { x: { validation: [], transform: [], expose: [], exclude: null, type: null, flags: {} } };
      setRaw(cls, raw as never);
      freezeRaw(cls);
      expect(Object.isFrozen(getRaw(cls))).toBe(true);
    });

    it('freezeRaw is a no-op when the class has no RAW slot', () => {
      const cls = fresh();
      expect(() => freezeRaw(cls)).not.toThrow();
    });
  });
});
