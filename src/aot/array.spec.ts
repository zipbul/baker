import { describe, it, expect } from 'bun:test';
import * as aot from './array';

const EXPECTED_EXPORTS = [
  'ArrayContains', 'ArrayNotContains', 'ArrayMinSize',
  'ArrayMaxSize', 'ArrayUnique', 'ArrayNotEmpty',
] as const;

describe('aot/array', () => {
  it('should export all 6 stub functions', () => {
    for (const name of EXPECTED_EXPORTS) {
      expect(typeof (aot as Record<string, unknown>)[name]).toBe('function');
    }
  });

  it('should return a PropertyDecorator when called with valid args', () => {
    expect(typeof aot.ArrayContains([1])).toBe('function');
    expect(typeof aot.ArrayNotContains([1])).toBe('function');
    expect(typeof aot.ArrayMinSize(0)).toBe('function');
    expect(typeof aot.ArrayMaxSize(10)).toBe('function');
    expect(typeof aot.ArrayUnique()).toBe('function');
    expect(typeof aot.ArrayNotEmpty()).toBe('function');
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
