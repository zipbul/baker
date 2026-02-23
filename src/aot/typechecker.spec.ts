import { describe, it, expect } from 'bun:test';
import * as aot from './typechecker';

const EXPECTED_EXPORTS = [
  'IsString', 'IsNumber', 'IsBoolean', 'IsDate',
  'IsEnum', 'IsInt', 'IsArray', 'IsObject',
] as const;

describe('aot/typechecker', () => {
  it('should export all 8 stub functions', () => {
    for (const name of EXPECTED_EXPORTS) {
      expect(typeof (aot as Record<string, unknown>)[name]).toBe('function');
    }
  });

  it('should return a PropertyDecorator when called with valid args', () => {
    expect(typeof aot.IsString()).toBe('function');
    expect(typeof aot.IsNumber()).toBe('function');
    expect(typeof aot.IsBoolean()).toBe('function');
    expect(typeof aot.IsDate()).toBe('function');
    expect(typeof aot.IsEnum({ A: 'a' })).toBe('function');
    expect(typeof aot.IsInt()).toBe('function');
    expect(typeof aot.IsArray()).toBe('function');
    expect(typeof aot.IsObject()).toBe('function');
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
