import { describe, it, expect, mock } from 'bun:test';
import { RequiredType } from './enums';

import type { EmitContext } from './interfaces';

import {
  isString,
  isNumber,
  isBoolean,
  isDate,
  isEnum,
  isInt,
  isArray,
  isObject,
  isRegExp,
  isFunction,
  isStatelessRegExp,
} from './typechecker';

function makeCtx(refIndex: number = 0) {
  const addRefMock = mock((_fn: unknown) => refIndex);
  const failMock = mock((code: string) => `errors.push({path:'x',code:'${code}'})`);
  const ctx: Partial<EmitContext> = {
    addRegex: mock((_re: RegExp) => 0),
    addRef: addRefMock,
    addExecutor: mock(() => 0),
    fail: failMock,
    collectErrors: true,
  };
  return { ctx: ctx as EmitContext, addRefMock, failMock };
}

// ─── isString ────────────────────────────────────────────────────────────────

describe('isString', () => {
  it('should return true when value is a non-empty string', () => {
    // Arrange / Act / Assert
    expect(isString('hello')).toBe(true);
  });

  it('should return true when value is an empty string', () => {
    // Arrange / Act / Assert
    expect(isString('')).toBe(true);
  });

  it('should return false when value is a number', () => {
    // Arrange / Act / Assert
    expect(isString(42)).toBe(false);
  });

  it('should return false when value is null', () => {
    // Arrange / Act / Assert
    expect(isString(null)).toBe(false);
  });

  it('should return false when value is an object', () => {
    // Arrange / Act / Assert
    expect(isString({})).toBe(false);
  });

  it('should generate typeof !== string check code when calling emit()', () => {
    // Arrange
    const { ctx, failMock } = makeCtx();
    // Act
    const code = isString.emit('v', ctx);
    // Assert
    expect(code).toContain(`typeof v !== 'string'`);
    expect(failMock).toHaveBeenCalledWith('isString');
  });

  it('should have ruleName isString and requiresType undefined', () => {
    // Arrange / Act / Assert
    expect(isString.ruleName).toBe('isString');
    expect(isString.requiresType).toBeUndefined();
  });
});

// ─── isNumber ─────────────────────────────────────────────────────────────────

describe('isNumber', () => {
  it('should return true when value is a positive integer', () => {
    // Arrange
    const rule = isNumber();
    // Act / Assert
    expect(rule(42)).toBe(true);
  });

  it('should return true when value is a decimal', () => {
    // Arrange
    const rule = isNumber();
    // Act / Assert
    expect(rule(3.14)).toBe(true);
  });

  it('should return true when value is 0', () => {
    // Arrange
    const rule = isNumber();
    // Act / Assert
    expect(rule(0)).toBe(true);
  });

  it('should return true when value is NaN and allowNaN is true', () => {
    // Arrange
    const rule = isNumber({ allowNaN: true });
    // Act / Assert
    expect(rule(NaN)).toBe(true);
  });

  it('should return true when value is Infinity and allowInfinity is true', () => {
    // Arrange
    const rule = isNumber({ allowInfinity: true });
    // Act / Assert
    expect(rule(Infinity)).toBe(true);
  });

  it('should return true when decimal places are within maxDecimalPlaces', () => {
    // Arrange
    const rule = isNumber({ maxDecimalPlaces: 2 });
    // Act / Assert
    expect(rule(1.5)).toBe(true);
  });

  it('should return false when value is a string', () => {
    // Arrange
    const rule = isNumber();
    // Act / Assert
    expect(rule('42')).toBe(false);
  });

  it('should return false when value is NaN and allowNaN is false by default', () => {
    // Arrange
    const rule = isNumber();
    // Act / Assert
    expect(rule(NaN)).toBe(false);
  });

  it('should return false when decimal places exceed maxDecimalPlaces', () => {
    // Arrange
    const rule = isNumber({ maxDecimalPlaces: 1 });
    // Act / Assert
    expect(rule(3.14)).toBe(false);
  });

  it('should generate typeof check code and have ruleName isNumber when calling emit()', () => {
    // Arrange
    const rule = isNumber();
    const { ctx, failMock } = makeCtx();
    // Act
    const code = rule.emit('v', ctx);
    // Assert
    expect(code).toContain(`typeof v !== 'number'`);
    expect(failMock).toHaveBeenCalledWith('isNumber');
    expect(rule.ruleName).toBe('isNumber');
    expect(rule.requiresType).toBeUndefined();
  });

  it('should generate maxDecimalPlaces check code when emit() is called with maxDecimalPlaces option (covers L56)', () => {
    // Arrange
    const rule = isNumber({ maxDecimalPlaces: 2 });
    const { ctx, failMock } = makeCtx();
    // Act
    const code = rule.emit('v', ctx);
    // Assert
    expect(code).toContain('toExponential');
    expect(code).toContain('mant');
    expect(failMock).toHaveBeenCalledWith('isNumber');
  });

  // E-7: maxDecimalPlaces with scientific notation (→ C-7)
  it('should return false for 1e-10 with maxDecimalPlaces: 2 (10 decimal places)', () => {
    const rule = isNumber({ maxDecimalPlaces: 2 });
    expect(rule(1e-10)).toBe(false);
  });

  it('should return true for 1e5 with maxDecimalPlaces: 0 (integer)', () => {
    const rule = isNumber({ maxDecimalPlaces: 0 });
    expect(rule(1e5)).toBe(true);
  });

  it('should return true for 1e-5 with maxDecimalPlaces: 5 (exactly 5 places)', () => {
    const rule = isNumber({ maxDecimalPlaces: 5 });
    expect(rule(1e-5)).toBe(true);
  });

  it('should return false for 1e-5 with maxDecimalPlaces: 4 (5 places > 4 allowed)', () => {
    const rule = isNumber({ maxDecimalPlaces: 4 });
    expect(rule(1e-5)).toBe(false);
  });
});

// ─── isBoolean ────────────────────────────────────────────────────────────────

describe('isBoolean', () => {
  it('should return true when value is boolean true', () => {
    // Arrange / Act / Assert
    expect(isBoolean(true)).toBe(true);
  });

  it('should return true when value is boolean false', () => {
    // Arrange / Act / Assert
    expect(isBoolean(false)).toBe(true);
  });

  it('should return false when value is string true', () => {
    // Arrange / Act / Assert
    expect(isBoolean('true')).toBe(false);
  });

  it('should return false when value is number 1', () => {
    // Arrange / Act / Assert
    expect(isBoolean(1)).toBe(false);
  });

  it('should generate typeof boolean check code and have ruleName isBoolean when calling emit()', () => {
    // Arrange
    const { ctx, failMock } = makeCtx();
    // Act
    const code = isBoolean.emit('v', ctx);
    // Assert
    expect(code).toContain(`typeof v !== 'boolean'`);
    expect(failMock).toHaveBeenCalledWith('isBoolean');
    expect(isBoolean.ruleName).toBe('isBoolean');
    expect(isBoolean.requiresType).toBeUndefined();
  });
});

// ─── isDate ───────────────────────────────────────────────────────────────────

describe('isDate', () => {
  it('should return true when value is a valid Date object', () => {
    // Arrange / Act / Assert
    expect(isDate(new Date('2024-01-01'))).toBe(true);
  });

  it('should return true when value is epoch date new Date(0)', () => {
    // Arrange / Act / Assert
    expect(isDate(new Date(0))).toBe(true);
  });

  it('should return false when value is an invalid Date', () => {
    // Arrange / Act / Assert
    expect(isDate(new Date('invalid'))).toBe(false);
  });

  it('should return false when value is a string', () => {
    // Arrange / Act / Assert
    expect(isDate('2024-01-01')).toBe(false);
  });

  it('should return false when value is null', () => {
    // Arrange / Act / Assert
    expect(isDate(null)).toBe(false);
  });

  it('should generate instanceof Date and valid date check code when calling emit()', () => {
    // Arrange
    const { ctx, failMock } = makeCtx();
    // Act
    const code = isDate.emit('v', ctx);
    // Assert
    expect(code).toContain('instanceof Date');
    expect(code).toContain('isNaN');
    expect(failMock).toHaveBeenCalledWith('isDate');
    expect(isDate.ruleName).toBe('isDate');
    expect(isDate.requiresType).toBeUndefined();
  });
});

// ─── isEnum ───────────────────────────────────────────────────────────────────

describe('isEnum', () => {
  enum Direction {
    Up = 'UP',
    Down = 'DOWN',
  }
  enum Status {
    Active = 1,
    Inactive = 0,
  }

  it('should return true when value is a string enum member', () => {
    // Arrange
    const rule = isEnum(Direction);
    // Act / Assert
    expect(rule('UP')).toBe(true);
  });

  it('should return true when value is a numeric enum member', () => {
    // Arrange
    const rule = isEnum(Status);
    // Act / Assert
    expect(rule(1)).toBe(true);
  });

  it('should return false for a numeric enum member NAME (reverse-mapping artifact)', () => {
    // Arrange — TS numeric enums compile to a reverse-mapped object ({ 0:'Inactive', 1:'Active',
    // Active:1, Inactive:0 }); the member-name strings must NOT count as valid values.
    const rule = isEnum(Status);
    // Act / Assert
    expect(rule('Active')).toBe(false);
    expect(rule('Inactive')).toBe(false);
  });

  it('should accept the zero value of a numeric enum', () => {
    // Arrange — Inactive = 0 is falsy but a legitimate member value
    const rule = isEnum(Status);
    // Act / Assert
    expect(rule(0)).toBe(true);
  });

  it('should handle heterogeneous (mixed numeric/string) enums', () => {
    // Arrange — only the numeric member gets a reverse mapping
    enum Mixed {
      Num = 1,
      Str = 'STR',
    }
    const rule = isEnum(Mixed);
    // Act / Assert
    expect(rule(1)).toBe(true);
    expect(rule('STR')).toBe(true);
    expect(rule('Num')).toBe(false);
  });

  it('should return false when value is not in enum', () => {
    // Arrange
    const rule = isEnum(Direction);
    // Act / Assert
    expect(rule('LEFT')).toBe(false);
  });

  it('should return false when value is null', () => {
    // Arrange
    const rule = isEnum(Direction);
    // Act / Assert
    expect(rule(null)).toBe(false);
  });

  it('should return independent rule objects on multiple factory calls', () => {
    // Arrange / Act
    const rule1 = isEnum(Direction);
    const rule2 = isEnum(Direction);
    // Assert
    expect(rule1).not.toBe(rule2);
  });

  it('should call ctx.addRef and generate includes check code (small enum) when calling emit()', () => {
    // Arrange — Direction has 2 entries (under Set threshold 8)
    const rule = isEnum(Direction);
    const { ctx, addRefMock, failMock } = makeCtx(0);
    // Act
    const code = rule.emit('v', ctx);
    // Assert
    expect(addRefMock).toHaveBeenCalledTimes(1);
    expect(code).toContain('.includes(v)');
    expect(failMock).toHaveBeenCalledWith('isEnum');
  });

  it('should generate set.has check code when enum has 8+ entries (factory promotes to Set)', () => {
    // Arrange
    const Big = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`K${i}`, `V${i}`]));
    const rule = isEnum(Big);
    const { ctx, addRefMock, failMock } = makeCtx(0);
    // Act
    const code = rule.emit('v', ctx);
    // Assert
    expect(addRefMock).toHaveBeenCalledTimes(1);
    expect(code).toContain('.has(v)');
    expect(failMock).toHaveBeenCalledWith('isEnum');
  });

  it('should have ruleName isEnum', () => {
    // Arrange
    const rule = isEnum(Direction);
    // Act / Assert
    expect(rule.ruleName).toBe('isEnum');
  });

  it('should return same result when called multiple times with same input', () => {
    // Arrange
    const rule = isEnum(Direction);
    // Act
    const r1 = rule('UP');
    const r2 = rule('UP');
    // Assert
    expect(r1).toBe(r2);
  });
});

// ─── isInt ────────────────────────────────────────────────────────────────────

describe('isInt', () => {
  it('should return true when value is a positive integer', () => {
    // Arrange / Act / Assert
    expect(isInt(5)).toBe(true);
  });

  it('should return true when value is 0', () => {
    // Arrange / Act / Assert
    expect(isInt(0)).toBe(true);
  });

  it('should return true when value is a negative integer', () => {
    // Arrange / Act / Assert
    expect(isInt(-3)).toBe(true);
  });

  it('should return false when value is a decimal', () => {
    // Arrange / Act / Assert
    expect(isInt(1.5)).toBe(false);
  });

  it('should return false when value is NaN', () => {
    // Arrange / Act / Assert
    expect(isInt(NaN)).toBe(false);
  });

  it('should return false when value is a string', () => {
    // Arrange / Act / Assert
    expect(isInt('1')).toBe(false);
  });

  it('should generate typeof and Number.isInteger check code when calling emit()', () => {
    // Arrange
    const { ctx, failMock } = makeCtx();
    // Act
    const code = isInt.emit('v', ctx);
    // Assert
    expect(code).toContain(`typeof v !== 'number'`);
    expect(code).toContain('Number.isInteger');
    expect(failMock).toHaveBeenCalledWith('isInt');
    expect(isInt.ruleName).toBe('isInt');
    expect(isInt.requiresType).toBe(RequiredType.Number);
  });
});

// ─── isArray ──────────────────────────────────────────────────────────────────

describe('isArray', () => {
  it('should return true for an empty array', () => {
    expect(isArray([])).toBe(true);
  });

  it('should return true for a non-empty array', () => {
    expect(isArray([1, 2, 3])).toBe(true);
  });

  it('should return false for a plain object', () => {
    expect(isArray({})).toBe(false);
  });

  it('should return false for a string', () => {
    expect(isArray('hello')).toBe(false);
  });

  it('should return false for null', () => {
    expect(isArray(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isArray(undefined)).toBe(false);
  });

  it('should return false for a number', () => {
    expect(isArray(42)).toBe(false);
  });

  it('should generate Array.isArray check code when calling emit()', () => {
    const { ctx, failMock } = makeCtx();
    const code = isArray.emit('v', ctx);
    expect(code).toContain('Array.isArray(v)');
    expect(failMock).toHaveBeenCalledWith('isArray');
    expect(isArray.ruleName).toBe('isArray');
    expect(isArray.requiresType).toBeUndefined();
  });
});

// ─── isObject ─────────────────────────────────────────────────────────────────

describe('isObject', () => {
  it('should return true for a plain object', () => {
    expect(isObject({})).toBe(true);
  });

  it('should return true for an object with properties', () => {
    expect(isObject({ a: 1 })).toBe(true);
  });

  it('should return false for null', () => {
    expect(isObject(null)).toBe(false);
  });

  it('should return false for an array', () => {
    expect(isObject([])).toBe(false);
  });

  it('should return false for a string', () => {
    expect(isObject('hello')).toBe(false);
  });

  it('should return false for a number', () => {
    expect(isObject(42)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isObject(undefined)).toBe(false);
  });

  it('should generate isObject check code when calling emit()', () => {
    const { ctx, failMock } = makeCtx();
    const code = isObject.emit('v', ctx);
    expect(code).toContain('typeof v');
    expect(failMock).toHaveBeenCalledWith('isObject');
    expect(isObject.ruleName).toBe('isObject');
    expect(isObject.requiresType).toBeUndefined();
  });
});

// ─── E-11: emit code compilation — new Function() round-trip ─────────────

describe('E-11: emit code compiles and runs correctly via new Function()', () => {
  /** Real EmitContext that tracks refs/regexes and generates executable fail code */
  function makeRealCtx() {
    const regexes: RegExp[] = [];
    const refs: unknown[] = [];
    const errors: { code: string }[] = [];
    const ctx: EmitContext = {
      addRegex(re: RegExp) {
        regexes.push(re);
        return regexes.length - 1;
      },
      addRef(value: unknown) {
        refs.push(value);
        return refs.length - 1;
      },
      addExecutor() {
        return 0;
      },
      fail(code: string) {
        return `errors.push({code:'${code}'})`;
      },
      collectErrors: true,
    };
    return { ctx, regexes, refs, errors };
  }

  /** Compile emit code into a runnable function */
  function compile(emitCode: string, _regexes: RegExp[], _refs: unknown[]) {
    const body = `'use strict'; var errors = []; ${emitCode} return errors;`;
    return new Function('v', 're', 'refs', body).bind(null) as (v: unknown, re: RegExp[], refs: unknown[]) => { code: string }[];
  }

  it('isString — accepts string, rejects number', () => {
    const { ctx, regexes, refs } = makeRealCtx();
    const code = isString.emit('v', ctx);
    const fn = compile(code, regexes, refs);

    expect(fn('hello', regexes, refs)).toEqual([]);
    expect(fn(42, regexes, refs).length).toBeGreaterThan(0);
    expect(fn(42, regexes, refs)[0]!.code).toBe('isString');
  });

  it('isNumber() — accepts 42, rejects NaN', () => {
    const rule = isNumber();
    const { ctx, regexes, refs } = makeRealCtx();
    const code = rule.emit('v', ctx);
    const fn = compile(code, regexes, refs);

    expect(fn(42, regexes, refs)).toEqual([]);
    expect(fn(NaN, regexes, refs).length).toBeGreaterThan(0);
  });

  it('isEnum — accepts valid member, rejects invalid', () => {
    enum Color {
      Red = 'red',
      Blue = 'blue',
    }
    const rule = isEnum(Color);
    const { ctx, regexes, refs } = makeRealCtx();
    const code = rule.emit('v', ctx);
    const fn = compile(code, regexes, refs);

    expect(fn('red', regexes, refs)).toEqual([]);
    expect(fn('green', regexes, refs).length).toBeGreaterThan(0);
    expect(fn('green', regexes, refs)[0]!.code).toBe('isEnum');
  });

  it('isInt — accepts integer, rejects decimal', () => {
    const { ctx, regexes, refs } = makeRealCtx();
    const code = isInt.emit('v', ctx);
    const fn = compile(code, regexes, refs);

    expect(fn(5, regexes, refs)).toEqual([]);
    expect(fn(3.14, regexes, refs).length).toBeGreaterThan(0);
  });

  it('min(5) — accepts 5 and 10, rejects 4', () => {
    const { min } = require('../rules/number') as typeof import('../rules/number');
    const rule = min(5);
    const { ctx, regexes, refs } = makeRealCtx();
    const code = rule.emit('v', ctx);
    const fn = compile(code, regexes, refs);

    expect(fn(5, regexes, refs)).toEqual([]);
    expect(fn(10, regexes, refs)).toEqual([]);
    expect(fn(4, regexes, refs).length).toBeGreaterThan(0);
    expect(fn(4, regexes, refs)[0]!.code).toBe('min');
  });

  it('minLength(3) — accepts "abc", rejects "ab"', () => {
    const { minLength } = require('../rules/string') as typeof import('../rules/string');
    const rule = minLength(3);
    const { ctx, regexes, refs } = makeRealCtx();
    const code = rule.emit('v', ctx);
    const fn = compile(code, regexes, refs);

    expect(fn('abc', regexes, refs)).toEqual([]);
    expect(fn('abcd', regexes, refs)).toEqual([]);
    expect(fn('ab', regexes, refs).length).toBeGreaterThan(0);
    expect(fn('ab', regexes, refs)[0]!.code).toBe('minLength');
  });
});

// ─── isRegExp ──────────────────────────────────────────────────────────────────

describe('isRegExp', () => {
  it('should return true for a RegExp literal', () => {
    expect(isRegExp(/abc/)).toBe(true);
  });

  it('should return true for a RegExp constructed instance', () => {
    expect(isRegExp(new RegExp('abc'))).toBe(true);
  });

  it('should return false for a string that looks like a pattern', () => {
    expect(isRegExp('/abc/')).toBe(false);
  });

  it('should return false for non-RegExp values', () => {
    for (const v of [null, undefined, 42, {}, [], () => {}, 'abc']) {
      expect(isRegExp(v)).toBe(false);
    }
  });

  it('should emit an instanceof RegExp check and have ruleName isRegExp', () => {
    const { ctx, failMock } = makeCtx();
    const code = isRegExp.emit('v', ctx);
    expect(code).toContain('v instanceof RegExp');
    expect(failMock).toHaveBeenCalledWith('isRegExp');
    expect(isRegExp.ruleName).toBe('isRegExp');
    expect(isRegExp.requiresType).toBeUndefined();
  });
});

// ─── isFunction ────────────────────────────────────────────────────────────────

describe('isFunction', () => {
  it('should return true for a function declaration reference', () => {
    function f() {}
    expect(isFunction(f)).toBe(true);
  });

  it('should return true for an arrow function', () => {
    expect(isFunction(() => {})).toBe(true);
  });

  it('should return true for a class constructor', () => {
    class C {}
    expect(isFunction(C)).toBe(true);
  });

  it('should return false for non-function values', () => {
    for (const v of [null, undefined, 42, {}, [], 'fn', /x/]) {
      expect(isFunction(v)).toBe(false);
    }
  });

  it('should emit a typeof function check and have ruleName isFunction', () => {
    const { ctx, failMock } = makeCtx();
    const code = isFunction.emit('v', ctx);
    expect(code).toContain("typeof v !== 'function'");
    expect(failMock).toHaveBeenCalledWith('isFunction');
    expect(isFunction.ruleName).toBe('isFunction');
    expect(isFunction.requiresType).toBeUndefined();
  });
});

// ─── isStatelessRegExp ───────────────────────────────────────────────────────

describe('isStatelessRegExp', () => {
  it('should return true for a RegExp with no flags', () => {
    expect(isStatelessRegExp(/^https:\/\/.*$/)).toBe(true);
  });

  it('should return true for stateless flags in isolation (d/i/m/s/u/v)', () => {
    for (const re of [/x/d, /x/i, /x/m, /x/s, /x/u, new RegExp('x', 'v')]) {
      expect(isStatelessRegExp(re)).toBe(true);
    }
  });

  it('should return true for combined stateless flags', () => {
    expect(isStatelessRegExp(/x/imsu)).toBe(true);
  });

  it('should return true for a constructed RegExp without flags', () => {
    expect(isStatelessRegExp(new RegExp('foo'))).toBe(true);
  });

  it('should return true for a constructed RegExp with a stateless flag', () => {
    expect(isStatelessRegExp(new RegExp('foo', 'i'))).toBe(true);
  });

  it('should return true for a RegExp subclass instance without g/y', () => {
    class SubRe extends RegExp {}
    expect(isStatelessRegExp(new SubRe('foo'))).toBe(true);
  });

  it('should return true for a non-g/y RegExp with a manually-set lastIndex (test ignores it)', () => {
    const re = /foo/;
    re.lastIndex = 99;
    expect(isStatelessRegExp(re)).toBe(true);
  });

  it('should return false for the global flag', () => {
    expect(isStatelessRegExp(/x/g)).toBe(false);
  });

  it('should return false for the sticky flag', () => {
    expect(isStatelessRegExp(/x/y)).toBe(false);
  });

  it('should return false for global+sticky and global+stateless combinations', () => {
    for (const re of [/x/gy, /x/gi, new RegExp('foo', 'g')]) {
      expect(isStatelessRegExp(re)).toBe(false);
    }
  });

  it('should return false for a RegExp subclass instance with the global flag', () => {
    class SubRe extends RegExp {}
    expect(isStatelessRegExp(new SubRe('foo', 'g'))).toBe(false);
  });

  it('should return false for non-RegExp values', () => {
    for (const v of ['/x/', 42, null, undefined, {}, [], () => {}]) {
      expect(isStatelessRegExp(v)).toBe(false);
    }
  });

  it('should emit an instanceof + global/sticky check and have ruleName isStatelessRegExp', () => {
    const { ctx, failMock } = makeCtx();
    const code = isStatelessRegExp.emit('v', ctx);
    expect(code).toContain('v instanceof RegExp');
    expect(code).toContain('v.global');
    expect(code).toContain('v.sticky');
    expect(failMock).toHaveBeenCalledWith('isStatelessRegExp');
    expect(isStatelessRegExp.ruleName).toBe('isStatelessRegExp');
    expect(isStatelessRegExp.requiresType).toBeUndefined();
  });
});
