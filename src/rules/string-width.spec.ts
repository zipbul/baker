import { describe, it, expect, mock } from 'bun:test';

import type { EmitContext } from './types';

import { isFullWidth, isHalfWidth, isVariableWidth, isMultibyte, isSurrogatePair } from './string';

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

describe('isFullWidth', () => {
  it('should return true for string containing full-width character', () => {
    expect(isFullWidth('Ａ')).toBe(true);
  });

  it('should return false for ASCII-only string', () => {
    expect(isFullWidth('A')).toBe(false);
  });

  it('should generate regex test code when calling emit() and have ruleName isFullWidth', () => {
    const { ctx, addRegexMock, failMock } = makeCtx(0);
    isFullWidth.emit('v', ctx);
    expect(addRegexMock).toHaveBeenCalledTimes(1);
    expect(failMock).toHaveBeenCalledWith('isFullWidth');
    expect(isFullWidth.ruleName).toBe('isFullWidth');
  });

  it('should return false for empty string', () => {
    expect(isFullWidth('')).toBe(false);
  });
});

describe('isHalfWidth', () => {
  it('should return true for string containing half-width character', () => {
    expect(isHalfWidth('abc123')).toBe(true);
  });

  it('should return false for all full-width string', () => {
    expect(isHalfWidth('ＡＢＣＤ')).toBe(false);
  });

  it('should generate regex test code when calling emit() and have ruleName isHalfWidth', () => {
    const { ctx, addRegexMock, failMock } = makeCtx(0);
    isHalfWidth.emit('v', ctx);
    expect(addRegexMock).toHaveBeenCalledTimes(1);
    expect(failMock).toHaveBeenCalledWith('isHalfWidth');
    expect(isHalfWidth.ruleName).toBe('isHalfWidth');
  });

  it('should return false for empty string', () => {
    expect(isHalfWidth('')).toBe(false);
  });
});

describe('isVariableWidth', () => {
  it('should return true for string containing both full-width and half-width characters', () => {
    expect(isVariableWidth('Ａabc')).toBe(true);
  });

  it('should return false for all half-width string', () => {
    expect(isVariableWidth('abc')).toBe(false);
  });

  it('should return false for all full-width string', () => {
    expect(isVariableWidth('ＡＢＣ')).toBe(false);
  });

  it('should generate regex test code when calling emit() and have ruleName isVariableWidth', () => {
    const { ctx, failMock } = makeCtx(0);
    const code = isVariableWidth.emit('v', ctx);
    expect(code).toBeTruthy();
    expect(failMock).toHaveBeenCalledWith('isVariableWidth');
    expect(isVariableWidth.ruleName).toBe('isVariableWidth');
  });

  // E-4: empty string → false (runtime and emit)
  it('should return false for empty string', () => {
    expect(isVariableWidth('')).toBe(false);
  });

  it('should emit code that fails for empty string (via FULLWIDTH+HALFWIDTH regex returning false)', () => {
    const { ctx } = makeCtx(0);
    const code = isVariableWidth.emit('v', ctx);
    // Both regexes return false on empty input, so the codegen relies on the regex semantics
    // rather than an explicit `.length === 0` guard.
    expect(code).toContain('!re[');
    expect(code).toContain('.test(v)');
  });
});

describe('isMultibyte', () => {
  it('should return true for string containing multibyte character', () => {
    expect(isMultibyte('日本語')).toBe(true);
  });

  it('should return false for ASCII-only string', () => {
    expect(isMultibyte('hello')).toBe(false);
  });

  it('should generate regex test code when calling emit() and have ruleName isMultibyte', () => {
    const { ctx, addRegexMock, failMock } = makeCtx(0);
    isMultibyte.emit('v', ctx);
    expect(addRegexMock).toHaveBeenCalledTimes(1);
    expect(failMock).toHaveBeenCalledWith('isMultibyte');
    expect(isMultibyte.ruleName).toBe('isMultibyte');
  });

  it('should return false for empty string', () => {
    expect(isMultibyte('')).toBe(false);
  });
});

describe('isSurrogatePair', () => {
  it('should return true for string containing surrogate pair', () => {
    expect(isSurrogatePair('\uD83D\uDE00')).toBe(true);
  });

  it('should return false for ASCII-only string', () => {
    expect(isSurrogatePair('hello')).toBe(false);
  });

  it('should generate regex test code when calling emit() and have ruleName isSurrogatePair', () => {
    const { ctx, addRegexMock, failMock } = makeCtx(0);
    isSurrogatePair.emit('v', ctx);
    expect(addRegexMock).toHaveBeenCalledTimes(1);
    expect(failMock).toHaveBeenCalledWith('isSurrogatePair');
    expect(isSurrogatePair.ruleName).toBe('isSurrogatePair');
  });

  it('should return false for empty string', () => {
    expect(isSurrogatePair('')).toBe(false);
  });
});
