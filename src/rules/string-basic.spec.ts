import { describe, it, expect, mock } from 'bun:test';
import { RequiredType } from './enums';

import type { EmitContext } from './interfaces';

import {
  minLength,
  maxLength,
  length,
  contains,
  notContains,
  matches,
  isLowercase,
  isUppercase,
  isAscii,
  isAlpha,
  isAlphanumeric,
  isBooleanString,
  isNumberString,
  isDecimal,
  isHttpToken,
  isOrigin,
  isCorsOrigin,
} from './string';

function makeCtx(refIndex: number = 0) {
  const addRefMock = mock((_fn: unknown) => refIndex);
  const addRegexMock = mock((_re: RegExp) => refIndex);
  const failMock = mock((code: string) => `_errors.push({path:'x',code:'${code}'})`);
  const ctx: Partial<EmitContext> = {
    addRegex: addRegexMock,
    addRef: addRefMock,
    addExecutor: mock(() => 0),
    fail: failMock,
    collectErrors: true,
  };
  return { ctx: ctx as EmitContext, addRefMock, addRegexMock, failMock };
}

describe('minLength', () => {
  it('should return true when string length equals minimum', () => {
    const rule = minLength(3);
    expect(rule('abc')).toBe(true);
  });

  it('should return true when string length exceeds minimum', () => {
    const rule = minLength(3);
    expect(rule('abcde')).toBe(true);
  });

  it('should return false when string length is less than minimum', () => {
    const rule = minLength(3);
    expect(rule('ab')).toBe(false);
  });

  it('should return true for empty string when minimum is 0', () => {
    const rule = minLength(0);
    expect(rule('')).toBe(true);
  });

  it('should generate v.length < n check code when calling emit()', () => {
    const rule = minLength(3);
    const { ctx, failMock } = makeCtx();
    const code = rule.emit('v', ctx);
    expect(code).toContain('v.length < 3');
    expect(failMock).toHaveBeenCalledWith('minLength');
  });

  it('should have ruleName minLength and requiresType string', () => {
    const rule = minLength(3);
    expect(rule.ruleName).toBe('minLength');
    expect(rule.requiresType).toBe(RequiredType.String);
  });

  it('should return independent rule objects on multiple factory calls', () => {
    const r1 = minLength(3);
    const r2 = minLength(3);
    expect(r1).not.toBe(r2);
  });
});

describe('maxLength', () => {
  it('should return true when string length is within maximum', () => {
    const rule = maxLength(5);
    expect(rule('abc')).toBe(true);
  });

  it('should return true when string length equals maximum', () => {
    const rule = maxLength(5);
    expect(rule('abcde')).toBe(true);
  });

  it('should return false when string length exceeds maximum', () => {
    const rule = maxLength(5);
    expect(rule('abcdef')).toBe(false);
  });

  it('should return true for empty string when maximum is 0', () => {
    const rule = maxLength(0);
    expect(rule('')).toBe(true);
  });

  it('should generate v.length > n check code when calling emit()', () => {
    const rule = maxLength(5);
    const { ctx, failMock } = makeCtx();
    const code = rule.emit('v', ctx);
    expect(code).toContain('v.length > 5');
    expect(failMock).toHaveBeenCalledWith('maxLength');
  });

  it('should have ruleName maxLength and requiresType string', () => {
    const rule = maxLength(5);
    expect(rule.ruleName).toBe('maxLength');
    expect(rule.requiresType).toBe(RequiredType.String);
  });
});

describe('length', () => {
  it('should return true when string length is within range', () => {
    const rule = length(3, 5);
    expect(rule('abcd')).toBe(true);
  });

  it('should return true when string length equals minimum boundary', () => {
    const rule = length(3, 5);
    expect(rule('abc')).toBe(true);
  });

  it('should return true when string length equals maximum boundary', () => {
    const rule = length(3, 5);
    expect(rule('abcde')).toBe(true);
  });

  it('should return false when string length is below minimum', () => {
    const rule = length(3, 5);
    expect(rule('ab')).toBe(false);
  });

  it('should return false when string length exceeds maximum', () => {
    const rule = length(3, 5);
    expect(rule('abcdef')).toBe(false);
  });

  it('should return true for exact single length when min equals max', () => {
    const rule = length(3, 3);
    expect(rule('abc')).toBe(true);
  });

  it('should generate range check code when calling emit()', () => {
    const rule = length(3, 5);
    const { ctx, failMock } = makeCtx();
    const code = rule.emit('v', ctx);
    expect(code).toContain('v.length < 3');
    expect(code).toContain('v.length > 5');
    expect(failMock).toHaveBeenCalledWith('length');
  });

  it('should have ruleName length and requiresType string', () => {
    const rule = length(3, 5);
    expect(rule.ruleName).toBe('length');
    expect(rule.requiresType).toBe(RequiredType.String);
  });
});

describe('contains', () => {
  it('should return true when string contains seed', () => {
    const rule = contains('foo');
    expect(rule('foobar')).toBe(true);
  });

  it('should return false when string does not contain seed', () => {
    const rule = contains('foo');
    expect(rule('barbaz')).toBe(false);
  });

  it('should call ctx.addRef with seed and generate includes check when calling emit()', () => {
    const rule = contains('foo');
    const { ctx, addRefMock, failMock } = makeCtx(0);
    const code = rule.emit('v', ctx);
    expect(addRefMock).toHaveBeenCalledTimes(1);
    expect(addRefMock).toHaveBeenCalledWith('foo');
    expect(code).toContain('refs[0]');
    expect(failMock).toHaveBeenCalledWith('contains');
  });

  it('should have ruleName contains and requiresType string', () => {
    const rule = contains('foo');
    expect(rule.ruleName).toBe('contains');
    expect(rule.requiresType).toBe(RequiredType.String);
  });
});

describe('notContains', () => {
  it('should return true when string does not contain seed', () => {
    const rule = notContains('foo');
    expect(rule('barbaz')).toBe(true);
  });

  it('should return false when string contains seed', () => {
    const rule = notContains('foo');
    expect(rule('foobar')).toBe(false);
  });

  it('should call ctx.addRef with seed and generate inverse includes check when calling emit()', () => {
    const rule = notContains('foo');
    const { ctx, addRefMock, failMock } = makeCtx(0);
    const code = rule.emit('v', ctx);
    expect(addRefMock).toHaveBeenCalledTimes(1);
    expect(code).toContain('refs[0]');
    expect(failMock).toHaveBeenCalledWith('notContains');
  });

  it('should have ruleName notContains', () => {
    const rule = notContains('foo');
    expect(rule.ruleName).toBe('notContains');
  });
});

describe('matches', () => {
  it('should return true when string matches pattern', () => {
    const rule = matches(/^[a-z]+$/);
    expect(rule('hello')).toBe(true);
  });

  it('should return false when string does not match pattern', () => {
    const rule = matches(/^[a-z]+$/);
    expect(rule('Hello123')).toBe(false);
  });

  it('should support string pattern with modifiers', () => {
    const rule = matches('^[a-z]+$', 'i');
    expect(rule('HELLO')).toBe(true);
  });

  it('should call ctx.addRegex and generate test check code when calling emit()', () => {
    const rule = matches(/^[a-z]+$/);
    const { ctx, addRegexMock, failMock } = makeCtx(0);
    const code = rule.emit('v', ctx);
    expect(addRegexMock).toHaveBeenCalledTimes(1);
    expect(code).toContain('re[0]');
    expect(code).toContain('.test(');
    expect(failMock).toHaveBeenCalledWith('matches');
  });

  it('should have ruleName matches and requiresType string', () => {
    const rule = matches(/^[a-z]+$/);
    expect(rule.ruleName).toBe('matches');
    expect(rule.requiresType).toBe(RequiredType.String);
  });

  it('should return false for empty string when pattern requires content', () => {
    const rule = matches(/^[a-z]+$/);
    expect(rule('')).toBe(false);
  });

  it('should be stateless across calls when the pattern carries a global flag', () => {
    const rule = matches(/^[a-z]+$/g);
    expect(rule('abc')).toBe(true);
    // A stateful (g-flagged) regex advances lastIndex, so the second identical value would wrongly fail.
    expect(rule('abc')).toBe(true);
    expect(rule('abc')).toBe(true);
  });

  it('should be stateless across calls when the pattern carries a sticky flag', () => {
    const rule = matches(/^[a-z]+$/y);
    expect(rule('abc')).toBe(true);
    expect(rule('abc')).toBe(true);
  });

  it('should be stateless when the global flag comes from the string-and-modifiers form', () => {
    const rule = matches('^[a-z]+$', 'gi');
    expect(rule('ABC')).toBe(true);
    expect(rule('ABC')).toBe(true);
  });

  it('should preserve non-stateful flags such as case-insensitive', () => {
    const rule = matches(/^[a-z]+$/i);
    expect(rule('ABC')).toBe(true);
  });
});

// ─── Group B: Simple Boolean Checks ──────────────────────────────────────────

describe('isLowercase', () => {
  it('should return true for all lowercase string', () => {
    expect(isLowercase('hello world')).toBe(true);
  });

  it('should return false when string contains uppercase character', () => {
    expect(isLowercase('Hello')).toBe(false);
  });

  it('should generate toLowerCase comparison code when calling emit() and have ruleName isLowercase', () => {
    const { ctx, failMock } = makeCtx();
    const code = isLowercase.emit('v', ctx);
    expect(code).toContain('toLowerCase');
    expect(failMock).toHaveBeenCalledWith('isLowercase');
    expect(isLowercase.ruleName).toBe('isLowercase');
    expect(isLowercase.requiresType).toBe(RequiredType.String);
  });

  it('should return true for empty string', () => {
    expect(isLowercase('')).toBe(true);
  });
});

describe('isUppercase', () => {
  it('should return true for all uppercase string', () => {
    expect(isUppercase('HELLO WORLD')).toBe(true);
  });

  it('should return false when string contains lowercase character', () => {
    expect(isUppercase('Hello')).toBe(false);
  });

  it('should generate toUpperCase comparison code when calling emit() and have ruleName isUppercase', () => {
    const { ctx, failMock } = makeCtx();
    const code = isUppercase.emit('v', ctx);
    expect(code).toContain('toUpperCase');
    expect(failMock).toHaveBeenCalledWith('isUppercase');
    expect(isUppercase.ruleName).toBe('isUppercase');
  });

  it('should return true for empty string', () => {
    expect(isUppercase('')).toBe(true);
  });
});

describe('isAscii', () => {
  it('should return true for ASCII-only string', () => {
    expect(isAscii('Hello World! 123')).toBe(true);
  });

  it('should return false when string contains non-ASCII character', () => {
    expect(isAscii('café')).toBe(false);
  });

  it('should generate regex test code when calling emit() and have ruleName isAscii', () => {
    const { ctx, addRegexMock, failMock } = makeCtx(0);
    const code = isAscii.emit('v', ctx);
    expect(addRegexMock).toHaveBeenCalledTimes(1);
    expect(code).toContain('re[0]');
    expect(failMock).toHaveBeenCalledWith('isAscii');
    expect(isAscii.ruleName).toBe('isAscii');
  });

  it('should return true for empty string', () => {
    expect(isAscii('')).toBe(true);
  });
});

describe('isHttpToken', () => {
  // RFC 9110 §5.6.2 token = 1*tchar
  it('should return true for valid tokens (methods, field-names, tchar-only)', () => {
    for (const v of [
      'GET',
      'POST',
      'X-Foo',
      'X-Custom-Header',
      'Content-Type',
      'PROPFIND',
      'MKCALENDAR',
      'M-SEARCH',
      'foo.bar',
      '!#$%&',
      "!#$%&'*+-.^_`|~",
      'a`b',
    ]) {
      expect(isHttpToken(v)).toBe(true);
    }
  });

  it('should return false for non-tokens (separators, spaces, CTL, non-ASCII)', () => {
    for (const v of [
      '',
      ' ',
      'X Foo',
      'X-Foo(bar)',
      'X-Foo:Bar',
      'X-Foo,Bar',
      'X-Foo;',
      'X-Foo<>',
      'X-Foo\t',
      'X-Foo\n',
      'X-Foo\r',
      'GET\n',
      '\nGET',
      'X-한글',
    ]) {
      expect(isHttpToken(v)).toBe(false);
    }
  });

  it('should generate regex test code when calling emit() and have ruleName isHttpToken', () => {
    const { ctx, addRegexMock, failMock } = makeCtx(0);
    const code = isHttpToken.emit('v', ctx);
    expect(addRegexMock).toHaveBeenCalledTimes(1);
    expect(code).toContain('re[0]');
    expect(failMock).toHaveBeenCalledWith('isHttpToken');
    expect(isHttpToken.ruleName).toBe('isHttpToken');
  });
});

describe('isOrigin', () => {
  // RFC 6454 §6.2 serialized origin — WHATWG URL `.origin` byte-equality.
  it('should return true for canonical serialized origins and the opaque "null" literal', () => {
    for (const v of [
      'https://a.com',
      'https://a.com:8080',
      'http://localhost',
      'http://localhost:3000',
      'https://[::1]',
      'https://[::1]:8443',
      'https://xn--bj0bj06e.com', // punycode IDN
      'ws://a.com', // WebSocket origin (RFC 6455 §10.2) — tuple origin
      'wss://a.com:8443',
      'null', // RFC 6454 §6.2 opaque origin literal (does not parse via URL)
    ]) {
      expect(isOrigin(v)).toBe(true);
    }
  });

  it('should return false for non-canonical forms, parse failures, and the CORS wildcard', () => {
    for (const v of [
      '',
      '  ',
      'https://a.com/', // trailing slash
      'https://a.com/path', // path
      'https://a.com?q=1', // query
      'https://a.com#h', // fragment
      'HTTPS://A.COM', // uppercase scheme + host
      'https://A.com', // mixed-case host
      'https://a.com:443', // explicit default port (https)
      'http://a.com:80', // explicit default port (http)
      'http://[::1]:80', // IPv6 explicit default port
      'https://user:pass@a.com', // userinfo — URL.origin strips credentials
      'https://user@a.com', // userinfo (user only)
      ' https://a.com', // leading whitespace — URL trims, byte-mismatch
      'https://한글.com', // raw IDN unicode (punycode required)
      'not-a-url', // parse failure
      'file:///x', // opaque scheme → URL.origin === 'null'
      'data:text/plain,foo', // opaque scheme → URL.origin === 'null'
      'blob:https://a.com/uuid', // blob → URL.origin === 'https://a.com' ≠ input
      '*', // CORS wildcard — rejected by general isOrigin
    ]) {
      expect(isOrigin(v)).toBe(false);
    }
  });

  it('should return false for non-string input', () => {
    expect(isOrigin(42 as unknown as string)).toBe(false);
    expect(isOrigin(null as unknown as string)).toBe(false);
    expect(isOrigin(undefined as unknown as string)).toBe(false);
  });

  it('should generate a refs[] predicate call when calling emit() and have ruleName isOrigin', () => {
    const { ctx, addRefMock, failMock } = makeCtx(0);
    const code = isOrigin.emit('v', ctx);
    expect(addRefMock).toHaveBeenCalledTimes(1);
    expect(addRefMock.mock.calls[0]?.[0]).toBeInstanceOf(Function);
    expect(code).toContain('refs[0](v)'); // must actually call the predicate, not just reference it
    expect(failMock).toHaveBeenCalledWith('isOrigin');
    expect(isOrigin.ruleName).toBe('isOrigin');
    expect(isOrigin.requiresType).toBe(RequiredType.String);
  });
});

describe('isCorsOrigin', () => {
  // CORS-only superset of isOrigin: additionally accepts the '*' wildcard literal.
  it('should return true for everything isOrigin accepts plus the "*" wildcard', () => {
    for (const v of [
      'https://a.com',
      'https://a.com:8080', // non-default port
      'http://localhost',
      'https://[::1]',
      'https://xn--bj0bj06e.com',
      'ws://a.com', // superset of isOrigin — WebSocket origin
      'wss://a.com:8443',
      'null',
      '*', // CORS wildcard literal
    ]) {
      expect(isCorsOrigin(v)).toBe(true);
    }
  });

  it('should return false for non-canonical forms and parse failures', () => {
    for (const v of [
      '',
      '  ',
      'https://a.com/',
      'HTTPS://A.COM',
      'https://a.com:443',
      'https://user:pass@a.com', // userinfo stripped → byte-mismatch
      'https://한글.com',
      'not-a-url',
      'file:///x',
      '**', // not the bare wildcard
    ]) {
      expect(isCorsOrigin(v)).toBe(false);
    }
  });

  it('should return false for non-string input', () => {
    expect(isCorsOrigin(42 as unknown as string)).toBe(false);
    expect(isCorsOrigin(null as unknown as string)).toBe(false);
  });

  it('should generate a refs[] predicate call when calling emit() and have ruleName isCorsOrigin', () => {
    const { ctx, addRefMock, failMock } = makeCtx(0);
    const code = isCorsOrigin.emit('v', ctx);
    expect(addRefMock).toHaveBeenCalledTimes(1);
    expect(addRefMock.mock.calls[0]?.[0]).toBeInstanceOf(Function);
    expect(code).toContain('refs[0](v)'); // must actually call the predicate, not just reference it
    expect(failMock).toHaveBeenCalledWith('isCorsOrigin');
    expect(isCorsOrigin.ruleName).toBe('isCorsOrigin');
    expect(isCorsOrigin.requiresType).toBe(RequiredType.String);
  });
});

describe('isAlpha', () => {
  it('should return true for alphabetic-only string with default locale', () => {
    expect(isAlpha('HelloWorld')).toBe(true);
  });

  it('should return false when string contains digit', () => {
    expect(isAlpha('Hello1')).toBe(false);
  });

  it('should return false when string contains space', () => {
    expect(isAlpha('Hello World')).toBe(false);
  });

  it('should generate regex test code when calling emit() and have ruleName isAlpha', () => {
    const { ctx, addRegexMock, failMock } = makeCtx(0);
    const code = isAlpha.emit('v', ctx);
    expect(addRegexMock).toHaveBeenCalledTimes(1);
    expect(code).toContain('re[0]');
    expect(failMock).toHaveBeenCalledWith('isAlpha');
    expect(isAlpha.ruleName).toBe('isAlpha');
  });
});

describe('isAlphanumeric', () => {
  it('should return true for alphanumeric string with default locale', () => {
    expect(isAlphanumeric('Hello123')).toBe(true);
  });

  it('should return false when string contains special character', () => {
    expect(isAlphanumeric('Hello!')).toBe(false);
  });

  it('should generate regex test code when calling emit() and have ruleName isAlphanumeric', () => {
    const { ctx, addRegexMock, failMock } = makeCtx(0);
    isAlphanumeric.emit('v', ctx);
    expect(addRegexMock).toHaveBeenCalledTimes(1);
    expect(failMock).toHaveBeenCalledWith('isAlphanumeric');
    expect(isAlphanumeric.ruleName).toBe('isAlphanumeric');
  });

  it('should return false for empty string', () => {
    expect(isAlphanumeric('')).toBe(false);
  });
});

describe('isBooleanString', () => {
  it('should return true for "true"', () => {
    expect(isBooleanString('true')).toBe(true);
  });

  it('should return true for "false"', () => {
    expect(isBooleanString('false')).toBe(true);
  });

  it('should return true for "1"', () => {
    expect(isBooleanString('1')).toBe(true);
  });

  it('should return true for "0"', () => {
    expect(isBooleanString('0')).toBe(true);
  });

  it('should return false for arbitrary string', () => {
    expect(isBooleanString('yes')).toBe(false);
  });

  it('should generate inline boolean check code when calling emit() and have ruleName isBooleanString', () => {
    const { ctx, failMock } = makeCtx();
    const code = isBooleanString.emit('v', ctx);
    expect(code).toContain('true');
    expect(code).toContain('false');
    expect(failMock).toHaveBeenCalledWith('isBooleanString');
    expect(isBooleanString.ruleName).toBe('isBooleanString');
  });
});

describe('isNumberString', () => {
  it('should return true for integer string', () => {
    expect(isNumberString()('42')).toBe(true);
  });

  it('should return true for decimal string', () => {
    expect(isNumberString()('3.14')).toBe(true);
  });

  it('should return false for non-numeric string', () => {
    expect(isNumberString()('hello')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isNumberString()('')).toBe(false);
  });

  it('should return false for whitespace-only string', () => {
    expect(isNumberString()('   ')).toBe(false);
  });

  it('should return false for a hex literal string', () => {
    expect(isNumberString()('0x1A')).toBe(false);
  });

  it('should return false for a numeric value padded with whitespace', () => {
    expect(isNumberString()('  12  ')).toBe(false);
  });

  it('should return false for scientific notation', () => {
    expect(isNumberString()('1e5')).toBe(false);
  });

  it('should return true for a leading-dot decimal', () => {
    expect(isNumberString()('.5')).toBe(true);
  });

  it('should return false for a trailing-dot number', () => {
    expect(isNumberString()('5.')).toBe(false);
  });

  it('should generate number check code when calling emit() and have ruleName isNumberString', () => {
    const { ctx, failMock } = makeCtx();
    const code = isNumberString().emit('v', ctx);
    expect(code).toBeTruthy();
    expect(failMock).toHaveBeenCalledWith('isNumberString');
    expect(isNumberString().ruleName).toBe('isNumberString');
  });

  it('should emit a regex test (not Number coercion)', () => {
    const { ctx } = makeCtx();
    const code = isNumberString().emit('v', ctx);
    expect(code).toContain('re[');
    expect(code).not.toContain('Number(');
    expect(code).not.toContain('isFinite');
  });
});

describe('isNumberString — noSymbols option', () => {
  it('should reject "+123" when noSymbols is true', () => {
    expect(isNumberString({ noSymbols: true })('+123')).toBe(false);
  });

  it('should reject "-456" when noSymbols is true', () => {
    expect(isNumberString({ noSymbols: true })('-456')).toBe(false);
  });

  it('should reject "1.5" when noSymbols is true', () => {
    expect(isNumberString({ noSymbols: true })('1.5')).toBe(false);
  });

  it('should reject "1e5" when noSymbols is true', () => {
    expect(isNumberString({ noSymbols: true })('1e5')).toBe(false);
  });

  it('should accept "123" when noSymbols is true', () => {
    expect(isNumberString({ noSymbols: true })('123')).toBe(true);
  });

  it('should accept "0" when noSymbols is true', () => {
    expect(isNumberString({ noSymbols: true })('0')).toBe(true);
  });

  it('should accept "+123" when noSymbols is false (default)', () => {
    expect(isNumberString({ noSymbols: false })('+123')).toBe(true);
  });

  it('should accept "+123" when no options provided', () => {
    expect(isNumberString()('+123')).toBe(true);
  });
});

describe('isDecimal', () => {
  it('should return true for decimal number string', () => {
    expect(isDecimal()('1.5')).toBe(true);
  });

  it('should return true for integer string (no decimal required)', () => {
    expect(isDecimal()('42')).toBe(true);
  });

  it('should return false for non-numeric string', () => {
    expect(isDecimal()('hello')).toBe(false);
  });

  it('should return false for a trailing-dot number', () => {
    expect(isDecimal()('5.')).toBe(false);
  });

  it('should return true for a leading-dot decimal', () => {
    expect(isDecimal()('.5')).toBe(true);
  });

  it('should generate regex check code when calling emit() and have ruleName isDecimal', () => {
    const { ctx, failMock } = makeCtx(0);
    const code = isDecimal().emit('v', ctx);
    expect(code).toBeTruthy();
    expect(failMock).toHaveBeenCalledWith('isDecimal');
    expect(isDecimal().ruleName).toBe('isDecimal');
  });
});
