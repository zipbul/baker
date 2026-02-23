import { describe, it, expect } from 'bun:test';
import * as aot from './number';

const EXPECTED_EXPORTS = [
  'Min', 'Max', 'IsPositive', 'IsNegative', 'IsDivisibleBy',
] as const;

describe('aot/number', () => {
  it('should export all 5 stub functions', () => {
    for (const name of EXPECTED_EXPORTS) {
      expect(typeof (aot as Record<string, unknown>)[name]).toBe('function');
    }
  });

  it('should return a PropertyDecorator when called with valid args', () => {
    expect(typeof aot.Min(0)).toBe('function');
    expect(typeof aot.Max(100)).toBe('function');
    expect(typeof aot.IsPositive()).toBe('function');
    expect(typeof aot.IsNegative()).toBe('function');
    expect(typeof aot.IsDivisibleBy(2)).toBe('function');
  });

  it('should not throw when returned decorator is applied to a dummy target', () => {
    const target = {};
    const key = 'field';
    for (const name of EXPECTED_EXPORTS) {
      const decorator = (aot as Record<string, (...args: any[]) => PropertyDecorator>)[name](undefined as any);
      expect(() => decorator(target, key)).not.toThrow();
    }
  });
});
