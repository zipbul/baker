import { err } from '@zipbul/result';
import { describe, it, expect } from 'bun:test';

import type { BakerError } from '../../../src/errors';

import { toBakerErrors } from '../../../src/errors';
import { assertBakerError, assertDefined, assertIsErr, assertNotBakerError } from './assert';

describe('test assert helpers', () => {
  describe('assertBakerError', () => {
    it('throws on a non-BakerError value', () => {
      expect(() => assertBakerError({ ok: true })).toThrow(/expected BakerError/);
    });
    it('does not throw on a BakerError value', () => {
      const baker = toBakerErrors([{ path: 'x', code: 'isString' }]);
      expect(() => assertBakerError(baker)).not.toThrow();
    });
  });

  describe('assertNotBakerError', () => {
    it('throws on a BakerError value', () => {
      const baker = toBakerErrors([{ path: 'x', code: 'isString' }]);
      expect(() => assertNotBakerError(baker)).toThrow(/expected success/);
    });
    it('does not throw on a non-BakerError value', () => {
      expect(() => assertNotBakerError({ name: 'Alice' })).not.toThrow();
    });
  });

  describe('assertIsErr', () => {
    it('throws on a plain success value (not an Err)', () => {
      expect(() => assertIsErr({ name: 'Alice' })).toThrow(/expected Err/);
    });
    it('does not throw on Err', () => {
      const errVal: BakerError[] = [{ path: '', code: 'x' }];
      expect(() => assertIsErr(err(errVal))).not.toThrow();
    });
  });

  describe('assertDefined', () => {
    it('throws on null', () => {
      expect(() => assertDefined(null)).toThrow(/expected defined/);
    });
    it('throws on undefined', () => {
      expect(() => assertDefined(undefined)).toThrow(/expected defined/);
    });
    it('does not throw on defined values (including 0 and "")', () => {
      expect(() => assertDefined(0)).not.toThrow();
      expect(() => assertDefined('')).not.toThrow();
      expect(() => assertDefined(false)).not.toThrow();
    });
  });
});
