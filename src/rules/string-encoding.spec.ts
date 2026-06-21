import { describe, it, expect, mock } from 'bun:test';
import { RequiredType } from './enums';

import type { EmitContext } from './interfaces';

import { isHexadecimal, isOctal, isHexColor, isRgbColor, isHSL, isBase32, isBase58, isBase64 } from './string';

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

describe('isHexadecimal', () => {
  it('should return true for hexadecimal string', () => {
    expect(isHexadecimal('deadbeef')).toBe(true);
  });

  it('should return true for uppercase hex string', () => {
    expect(isHexadecimal('DEADBEEF')).toBe(true);
  });

  it('should return false for non-hex character', () => {
    expect(isHexadecimal('xyz')).toBe(false);
  });

  it('should generate regex test code when calling emit() and have ruleName isHexadecimal', () => {
    const { ctx, addRegexMock, failMock } = makeCtx(0);
    isHexadecimal.emit('v', ctx);
    expect(addRegexMock).toHaveBeenCalledTimes(1);
    expect(failMock).toHaveBeenCalledWith('isHexadecimal');
    expect(isHexadecimal.ruleName).toBe('isHexadecimal');
    expect(isHexadecimal.requiresType).toBe(RequiredType.String);
  });
});

describe('isOctal', () => {
  it('should return true for octal string', () => {
    expect(isOctal('0755')).toBe(true);
  });

  it('should return false for string containing 8 or 9', () => {
    expect(isOctal('089')).toBe(false);
  });

  it('should generate regex test code when calling emit() and have ruleName isOctal', () => {
    const { ctx, addRegexMock, failMock } = makeCtx(0);
    isOctal.emit('v', ctx);
    expect(addRegexMock).toHaveBeenCalledTimes(1);
    expect(failMock).toHaveBeenCalledWith('isOctal');
    expect(isOctal.ruleName).toBe('isOctal');
  });

  it('should return false for empty string', () => {
    expect(isOctal('')).toBe(false);
  });
});

describe('isHexColor', () => {
  it('should return true for valid 6-digit hex color', () => {
    expect(isHexColor('#ff0000')).toBe(true);
  });

  it('should return true for valid 3-digit hex color', () => {
    expect(isHexColor('#f00')).toBe(true);
  });

  it('should return false for hex color without hash', () => {
    expect(isHexColor('ff0000')).toBe(false);
  });

  it('should return false for invalid hex color', () => {
    expect(isHexColor('#xyz')).toBe(false);
  });

  it('should call ctx.addRegex and generate test code when calling emit() and have ruleName isHexColor', () => {
    const { ctx, addRegexMock, failMock } = makeCtx(0);
    isHexColor.emit('v', ctx);
    expect(addRegexMock).toHaveBeenCalledTimes(1);
    expect(failMock).toHaveBeenCalledWith('isHexColor');
    expect(isHexColor.ruleName).toBe('isHexColor');
    expect(isHexColor.requiresType).toBe(RequiredType.String);
  });
});

describe('isRgbColor', () => {
  it('should return true for valid rgb() color', () => {
    expect(isRgbColor()('rgb(255,0,0)')).toBe(true);
  });

  it('should return true for valid rgba() color', () => {
    expect(isRgbColor()('rgba(255,0,0,0.5)')).toBe(true);
  });

  it('should return false for invalid rgb color', () => {
    expect(isRgbColor()('rgb(256,0,0)')).toBe(false);
  });

  it('should return true for rgb with percentage values when includePercentValues is true', () => {
    expect(isRgbColor(true)('rgb(100%,0%,0%)')).toBe(true);
  });

  it('should call ctx.addRegex and generate test code when calling emit() and have ruleName isRgbColor', () => {
    const { ctx, addRegexMock, failMock } = makeCtx(0);
    isRgbColor().emit('v', ctx);
    expect(addRegexMock).toHaveBeenCalled();
    expect(failMock).toHaveBeenCalledWith('isRgbColor');
    expect(isRgbColor().ruleName).toBe('isRgbColor');
  });

  it('should generate percent-regex check code when emit() is called with includePercentValues=true', () => {
    const { ctx, addRegexMock, failMock } = makeCtx(0);
    const code = isRgbColor(true).emit('v', ctx);
    // Percent mode registers 4 regex slots: rgb-percent, rgba-percent, rgb-int, rgba-int.
    expect(addRegexMock).toHaveBeenCalledTimes(4);
    expect(code).toBeTruthy();
    expect(failMock).toHaveBeenCalledWith('isRgbColor');
  });
});

describe('isHSL', () => {
  it('should return true for valid hsl() color', () => {
    expect(isHSL('hsl(360,100%,50%)')).toBe(true);
  });

  it('should return true for valid hsla() color', () => {
    expect(isHSL('hsla(360,100%,50%,0.5)')).toBe(true);
  });

  it('should return false for invalid hsl color', () => {
    expect(isHSL('hsl(400,100%,50%)')).toBe(false);
  });

  it('should return false for hsl() carrying an alpha channel (alpha is only valid on hsla())', () => {
    expect(isHSL('hsl(120,50%,50%,0.5)')).toBe(false);
  });

  it('should return false for hsla() missing the alpha channel', () => {
    expect(isHSL('hsla(120,50%,50%)')).toBe(false);
  });

  it('should call ctx.addRegex and generate test code when calling emit() and have ruleName isHSL', () => {
    const { ctx, addRegexMock, failMock } = makeCtx(0);
    isHSL.emit('v', ctx);
    expect(addRegexMock).toHaveBeenCalledTimes(1);
    expect(failMock).toHaveBeenCalledWith('isHSL');
    expect(isHSL.ruleName).toBe('isHSL');
  });
});

describe('isBase32', () => {
  it('should return true for valid Base32 string', () => {
    expect(isBase32()('JBSWY3DPEB3W64TMMQQQ====')).toBe(true);
  });

  it('should return false for invalid Base32 string', () => {
    expect(isBase32()('Not!Valid')).toBe(false);
  });

  it('should call ctx.addRegex and generate test code when calling emit() and have ruleName isBase32', () => {
    const { ctx, addRegexMock, failMock } = makeCtx(0);
    isBase32().emit('v', ctx);
    expect(addRegexMock).toHaveBeenCalled();
    expect(failMock).toHaveBeenCalledWith('isBase32');
    expect(isBase32().ruleName).toBe('isBase32');
  });
});

describe('isBase58', () => {
  it('should return true for valid Base58 string', () => {
    expect(isBase58('3yZe7d')).toBe(true);
  });

  it('should return false for Base58 string containing 0, O, I, l', () => {
    expect(isBase58('0OIl')).toBe(false);
  });

  it('should call ctx.addRegex and generate test code when calling emit() and have ruleName isBase58', () => {
    const { ctx, addRegexMock, failMock } = makeCtx(0);
    isBase58.emit('v', ctx);
    expect(addRegexMock).toHaveBeenCalledTimes(1);
    expect(failMock).toHaveBeenCalledWith('isBase58');
    expect(isBase58.ruleName).toBe('isBase58');
  });
});

describe('isBase64', () => {
  it('should return true for valid standard Base64 string', () => {
    expect(isBase64()('SGVsbG8gV29ybGQ=')).toBe(true);
  });

  it('should return false for invalid Base64 string', () => {
    expect(isBase64()('Not!base64')).toBe(false);
  });

  it('should return true for URL-safe Base64 when urlSafe option is true', () => {
    expect(isBase64({ urlSafe: true })('SGVsbG8gV29ybGQ')).toBe(true);
  });

  it('should reject a URL-safe string with an invalid Base64 length (single char)', () => {
    expect(isBase64({ urlSafe: true })('a')).toBe(false);
  });

  it('should reject a malformed padded URL-safe string', () => {
    expect(isBase64({ urlSafe: true })('a===')).toBe(false);
  });

  it('should call ctx.addRegex and generate test code when calling emit() and have ruleName isBase64', () => {
    const { ctx, addRegexMock, failMock } = makeCtx(0);
    isBase64().emit('v', ctx);
    expect(addRegexMock).toHaveBeenCalled();
    expect(failMock).toHaveBeenCalledWith('isBase64');
    expect(isBase64().ruleName).toBe('isBase64');
  });
});
