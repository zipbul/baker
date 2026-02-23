import { describe, it, expect } from 'bun:test';
import * as aot from './locales';

const EXPECTED_EXPORTS = [
  'IsMobilePhone', 'IsPostalCode', 'IsIdentityCard', 'IsPassportNumber',
] as const;

describe('aot/locales', () => {
  it('should export all 4 stub functions', () => {
    for (const name of EXPECTED_EXPORTS) {
      expect(typeof (aot as Record<string, unknown>)[name]).toBe('function');
    }
  });

  it('should return a PropertyDecorator when called with valid args', () => {
    expect(typeof aot.IsMobilePhone('ko-KR')).toBe('function');
    expect(typeof aot.IsPostalCode('KR')).toBe('function');
    expect(typeof aot.IsIdentityCard('KR')).toBe('function');
    expect(typeof aot.IsPassportNumber('KR')).toBe('function');
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
