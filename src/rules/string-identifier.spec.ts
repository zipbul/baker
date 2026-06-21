import { describe, it, expect, mock } from 'bun:test';

import type { EmitContext } from './interfaces';

import {
  isISO8601,
  isISRC,
  isISO31661Alpha2,
  isISO31661Alpha3,
  isFirebasePushId,
  isSemVer,
  isMongoId,
  isDateString,
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

describe('isISO8601', () => {
  it('should return true for valid ISO 8601 date string', () => {
    expect(isISO8601()('2023-01-01')).toBe(true);
  });

  it('should return true for valid ISO 8601 datetime string', () => {
    expect(isISO8601()('2023-01-01T12:00:00Z')).toBe(true);
  });

  it('should return false for invalid date format', () => {
    expect(isISO8601()('01-01-2023')).toBe(false);
  });

  it('should call ctx.addRegex and generate test code when calling emit() and have ruleName isISO8601', () => {
    const { ctx, addRegexMock, failMock } = makeCtx(0);
    isISO8601().emit('v', ctx);
    expect(addRegexMock).toHaveBeenCalled();
    expect(failMock).toHaveBeenCalledWith('isISO8601');
    expect(isISO8601().ruleName).toBe('isISO8601');
  });

  it('should return true for valid date with strict: true', () => {
    expect(isISO8601({ strict: true })('2023-02-28')).toBe(true);
  });

  it('should return false for invalid month with strict: true', () => {
    expect(isISO8601({ strict: true })('2023-13-01')).toBe(false);
  });

  it('should return false for invalid day with strict: true', () => {
    expect(isISO8601({ strict: true })('2023-02-30')).toBe(false);
  });

  it('should reject an out-of-range month in a year-month string with strict: true', () => {
    expect(isISO8601({ strict: true })('2021-13')).toBe(false);
    expect(isISO8601({ strict: true })('2021-00')).toBe(false);
  });

  it('should accept a valid year-month string with strict: true', () => {
    expect(isISO8601({ strict: true })('2021-12')).toBe(true);
  });

  it('strict: true emit uses inline regex + date validation (no addRef)', () => {
    const { ctx, addRefMock, failMock } = makeCtx(0);
    const code = isISO8601({ strict: true }).emit('v', ctx);
    expect(addRefMock).not.toHaveBeenCalled();
    expect(code).toContain('re[');
    expect(code).toContain('mo');
    expect(code).toContain('da');
    expect(failMock).toHaveBeenCalledWith('isISO8601');
  });

  it('strict: true ruleName is isISO8601', () => {
    expect(isISO8601({ strict: true }).ruleName).toBe('isISO8601');
  });
});

describe('isISRC', () => {
  it('should return true for valid ISRC', () => {
    expect(isISRC('USRC17607839')).toBe(true);
  });

  it('should return false for invalid ISRC', () => {
    expect(isISRC('INVALID')).toBe(false);
  });

  it('should call ctx.addRegex and generate test code when calling emit() and have ruleName isISRC', () => {
    const { ctx, addRegexMock, failMock } = makeCtx(0);
    isISRC.emit('v', ctx);
    expect(addRegexMock).toHaveBeenCalledTimes(1);
    expect(failMock).toHaveBeenCalledWith('isISRC');
    expect(isISRC.ruleName).toBe('isISRC');
  });
});
describe('isISO31661Alpha2', () => {
  it('should return true for valid ISO 3166-1 alpha-2 code', () => {
    expect(isISO31661Alpha2('US')).toBe(true);
  });

  it('should return true for lowercase valid code', () => {
    expect(isISO31661Alpha2('us')).toBe(true);
  });

  it('should return false for invalid 2-letter code', () => {
    expect(isISO31661Alpha2('XX')).toBe(false);
  });

  it('should call ctx.addRef and generate test code when calling emit() and have ruleName isISO31661Alpha2', () => {
    const { ctx, addRefMock, failMock } = makeCtx(0);
    isISO31661Alpha2.emit('v', ctx);
    expect(addRefMock).toHaveBeenCalled();
    expect(failMock).toHaveBeenCalledWith('isISO31661Alpha2');
    expect(isISO31661Alpha2.ruleName).toBe('isISO31661Alpha2');
  });
});

describe('isISO31661Alpha3', () => {
  it('should return true for valid ISO 3166-1 alpha-3 code', () => {
    expect(isISO31661Alpha3('USA')).toBe(true);
  });

  it('should return false for invalid 3-letter code', () => {
    expect(isISO31661Alpha3('XXX')).toBe(false);
  });

  it('should return false for ANT (Netherlands Antilles, withdrawn from ISO 3166-1 in 2010)', () => {
    expect(isISO31661Alpha3('ANT')).toBe(false);
  });

  it('should call ctx.addRef and generate test code when calling emit() and have ruleName isISO31661Alpha3', () => {
    const { ctx, addRefMock, failMock } = makeCtx(0);
    isISO31661Alpha3.emit('v', ctx);
    expect(addRefMock).toHaveBeenCalled();
    expect(failMock).toHaveBeenCalledWith('isISO31661Alpha3');
    expect(isISO31661Alpha3.ruleName).toBe('isISO31661Alpha3');
  });
});

describe('isFirebasePushId', () => {
  it('should return true for valid Firebase Push ID (20 chars, base64url charset)', () => {
    expect(isFirebasePushId('-KkI7fTh9VD5V7FTB5sl')).toBe(true);
  });

  it('should return false for ID with wrong length', () => {
    expect(isFirebasePushId('abc')).toBe(false);
  });

  it('should call ctx.addRegex and generate test code when calling emit() and have ruleName isFirebasePushId', () => {
    const { ctx, addRegexMock, failMock } = makeCtx(0);
    isFirebasePushId.emit('v', ctx);
    expect(addRegexMock).toHaveBeenCalledTimes(1);
    expect(failMock).toHaveBeenCalledWith('isFirebasePushId');
    expect(isFirebasePushId.ruleName).toBe('isFirebasePushId');
  });
});

describe('isSemVer', () => {
  it('should return true for valid semantic version', () => {
    expect(isSemVer('1.2.3')).toBe(true);
  });

  it('should return true for version with pre-release tag', () => {
    expect(isSemVer('1.0.0-alpha.1')).toBe(true);
  });

  it('should return false for non-semver string', () => {
    expect(isSemVer('1.2')).toBe(false);
  });

  it('should call ctx.addRegex and generate test code when calling emit() and have ruleName isSemVer', () => {
    const { ctx, addRegexMock, failMock } = makeCtx(0);
    isSemVer.emit('v', ctx);
    expect(addRegexMock).toHaveBeenCalledTimes(1);
    expect(failMock).toHaveBeenCalledWith('isSemVer');
    expect(isSemVer.ruleName).toBe('isSemVer');
  });
});

describe('isMongoId', () => {
  it('should return true for valid MongoDB ObjectId (24-char hex)', () => {
    expect(isMongoId('507f1f77bcf86cd799439011')).toBe(true);
  });

  it('should return false for non-hex string', () => {
    expect(isMongoId('507f1f77bcf86cd79943901g')).toBe(false);
  });

  it('should return false for wrong-length hex string', () => {
    expect(isMongoId('507f1f77bcf86cd')).toBe(false);
  });

  it('should call ctx.addRegex and generate test code when calling emit() and have ruleName isMongoId', () => {
    const { ctx, addRegexMock, failMock } = makeCtx(0);
    isMongoId.emit('v', ctx);
    expect(addRegexMock).toHaveBeenCalledTimes(1);
    expect(failMock).toHaveBeenCalledWith('isMongoId');
    expect(isMongoId.ruleName).toBe('isMongoId');
  });
});

describe('isDateString', () => {
  it('should return true for valid ISO date string', () => {
    expect(isDateString()('2023-01-15')).toBe(true);
  });

  it('should return false for invalid date string format', () => {
    expect(isDateString()('15/01/2023')).toBe(false);
  });

  it('should call ctx.addRegex and generate test code when calling emit() and have ruleName isDateString', () => {
    const { ctx, addRegexMock, failMock } = makeCtx(0);
    isDateString().emit('v', ctx);
    expect(addRegexMock).toHaveBeenCalled();
    expect(failMock).toHaveBeenCalledWith('isDateString');
    expect(isDateString().ruleName).toBe('isDateString');
  });
});
