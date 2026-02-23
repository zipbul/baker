import { describe, it, expect } from 'bun:test';
import * as aot from './transform';

const EXPECTED_EXPORTS = ['Expose', 'Exclude', 'Transform', 'Type'] as const;

describe('aot/transform', () => {
  it('should export all 4 stub functions', () => {
    for (const name of EXPECTED_EXPORTS) {
      expect(typeof (aot as Record<string, unknown>)[name]).toBe('function');
    }
  });

  it('should return a PropertyDecorator when called with valid args', () => {
    expect(typeof aot.Expose()).toBe('function');
    expect(typeof aot.Exclude()).toBe('function');
    expect(typeof aot.Transform((v) => v, {})).toBe('function');
    expect(typeof aot.Type(() => class {})).toBe('function');
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
