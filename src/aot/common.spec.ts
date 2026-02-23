import { describe, it, expect } from 'bun:test';
import * as aot from './common';

const EXPECTED_EXPORTS = [
  'IsDefined', 'IsOptional', 'ValidateIf', 'ValidateNested',
  'Equals', 'NotEquals', 'IsEmpty', 'IsNotEmpty', 'IsIn', 'IsNotIn',
] as const;

describe('aot/common', () => {
  it('should export all 10 stub functions', () => {
    for (const name of EXPECTED_EXPORTS) {
      expect(typeof (aot as Record<string, unknown>)[name]).toBe('function');
    }
  });

  it('should return a PropertyDecorator when called with valid args', () => {
    expect(typeof aot.IsDefined()).toBe('function');
    expect(typeof aot.IsOptional()).toBe('function');
    expect(typeof aot.ValidateIf(() => true)).toBe('function');
    expect(typeof aot.ValidateNested()).toBe('function');
    expect(typeof aot.Equals('x')).toBe('function');
    expect(typeof aot.NotEquals('x')).toBe('function');
    expect(typeof aot.IsEmpty()).toBe('function');
    expect(typeof aot.IsNotEmpty()).toBe('function');
    expect(typeof aot.IsIn([1, 2])).toBe('function');
    expect(typeof aot.IsNotIn([1, 2])).toBe('function');
  });

  it('should not throw when returned decorator is applied to a dummy target', () => {
    const target = {};
    const key = 'field';
    for (const name of EXPECTED_EXPORTS) {
      const decorator = (aot as Record<string, (...args: any[]) => PropertyDecorator>)[name]!(undefined as any);
      expect(() => decorator(target, key)).not.toThrow();
    }
  });
});
