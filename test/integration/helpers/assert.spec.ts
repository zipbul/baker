import { describe, it, expect } from 'bun:test';

import type { BakerIssue } from '../../../src/common/errors';

import { toBakerIssueSet } from '../../../src/common/errors';
import { assertBakerIssueSet, assertDefined, assertIsErr, assertNotBakerIssueSet } from './assert';

describe('test assert helpers', () => {
  describe('assertBakerIssueSet', () => {
    it('throws on a non-BakerIssue value', () => {
      expect(() => assertBakerIssueSet({ ok: true })).toThrow(/expected BakerIssue/);
    });
    it('does not throw on a BakerIssue value', () => {
      const baker = toBakerIssueSet([{ path: 'x', code: 'isString' }]);
      expect(() => assertBakerIssueSet(baker)).not.toThrow();
    });
  });

  describe('assertNotBakerIssueSet', () => {
    it('throws on a BakerIssue value', () => {
      const baker = toBakerIssueSet([{ path: 'x', code: 'isString' }]);
      expect(() => assertNotBakerIssueSet(baker)).toThrow(/expected success/);
    });
    it('does not throw on a non-BakerIssue value', () => {
      expect(() => assertNotBakerIssueSet({ name: 'Alice' })).not.toThrow();
    });
  });

  describe('assertIsErr', () => {
    it('throws on a plain success value (not an array)', () => {
      expect(() => assertIsErr({ name: 'Alice' })).toThrow(/expected an error array/);
    });
    it('does not throw on an error array', () => {
      const errVal: BakerIssue[] = [{ path: '', code: 'x' }];
      expect(() => assertIsErr(errVal)).not.toThrow();
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
