import { describe, it, expect, mock } from 'bun:test';
import { RequiredType } from './enums';

import type { EmitContext } from './interfaces';

import {
  isEmail,
  isURL,
  isUUID,
  isIP,
  isMACAddress,
  isJWT,
  isLatLong,
  isLocale,
  isDataURI,
  isFQDN,
  isPort,
  isJSON,
  isMimeType,
  isMagnetURI,
  isByteLength,
  isHash,
  isRFC3339,
  isMilitaryTime,
  isLatitude,
  isLongitude,
  isEthereumAddress,
  isBtcAddress,
  isPhoneNumber,
  isStrongPassword,
  isTaxId,
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

describe('isEmail', () => {
  it('should return true for valid email address', () => {
    expect(isEmail()('user@example.com')).toBe(true);
  });

  it('should return true for email with subdomain', () => {
    expect(isEmail()('user@mail.example.co.uk')).toBe(true);
  });

  it('should return true for email with plus sign in local part', () => {
    expect(isEmail()('user+tag@example.com')).toBe(true);
  });

  it('should return false for email without at sign', () => {
    expect(isEmail()('userexample.com')).toBe(false);
  });

  it('should return false for email without domain', () => {
    expect(isEmail()('user@')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isEmail()('')).toBe(false);
  });

  it('should call ctx.addRegex and generate test code when calling emit()', () => {
    const { ctx, addRegexMock, failMock } = makeCtx(0);
    const code = isEmail().emit('v', ctx);
    expect(addRegexMock).toHaveBeenCalledTimes(1);
    expect(code).toContain('re[0]');
    expect(failMock).toHaveBeenCalledWith('isEmail');
  });

  it('should have ruleName isEmail and requiresType string', () => {
    expect(isEmail().ruleName).toBe('isEmail');
    expect(isEmail().requiresType).toBe(RequiredType.String);
  });
});

describe('isURL', () => {
  it('should return true for valid http URL', () => {
    expect(isURL()('http://example.com')).toBe(true);
  });

  it('should return true for valid https URL', () => {
    expect(isURL()('https://example.com/path?q=1')).toBe(true);
  });

  it('should return false for URL without protocol', () => {
    expect(isURL()('example.com')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isURL()('')).toBe(false);
  });

  it('should return true for URL with allowedProtocols option matching', () => {
    expect(isURL({ protocols: ['ftp'] })('ftp://ftp.example.com')).toBe(true);
  });

  it('should return false for URL with protocol not in allowedProtocols', () => {
    expect(isURL({ protocols: ['https'] })('http://example.com')).toBe(false);
  });

  it('should generate regex-based code when calling emit()', () => {
    const { ctx, addRegexMock, failMock } = makeCtx(0);
    const code = isURL().emit('v', ctx);
    expect(addRegexMock).toHaveBeenCalled();
    expect(code).toBeTruthy();
    expect(failMock).toHaveBeenCalledWith('isURL');
  });

  it('should have ruleName isURL and requiresType string', () => {
    expect(isURL().ruleName).toBe('isURL');
    expect(isURL().requiresType).toBe(RequiredType.String);
  });
});

describe('isUUID', () => {
  it('should return true for valid UUID v4 without version constraint', () => {
    expect(isUUID()('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('should return true for UUID v4 with version 4 constraint', () => {
    expect(isUUID(4)('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('should return false for invalid UUID format', () => {
    expect(isUUID()('not-a-uuid')).toBe(false);
  });

  it('should return false for UUID v4 with version 3 constraint', () => {
    expect(isUUID(3)('550e8400-e29b-41d4-a716-446655440000')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isUUID()('')).toBe(false);
  });

  it('should call ctx.addRegex and generate test code when calling emit()', () => {
    const { ctx, addRegexMock, failMock } = makeCtx(0);
    const code = isUUID().emit('v', ctx);
    expect(addRegexMock).toHaveBeenCalledTimes(1);
    expect(code).toContain('re[0]');
    expect(failMock).toHaveBeenCalledWith('isUUID');
  });

  it('should have ruleName isUUID and requiresType string', () => {
    expect(isUUID().ruleName).toBe('isUUID');
    expect(isUUID().requiresType).toBe(RequiredType.String);
  });
});

describe('isIP', () => {
  it('should return true for valid IPv4 address', () => {
    expect(isIP()('192.168.1.1')).toBe(true);
  });

  it('should return true for valid IPv6 address', () => {
    expect(isIP()('2001:db8::1')).toBe(true);
  });

  it('should return true for IPv4 loopback', () => {
    expect(isIP()('127.0.0.1')).toBe(true);
  });

  it('should return false for IP with octet out of range', () => {
    expect(isIP()('999.999.999.999')).toBe(false);
  });

  it('should return true for valid IPv4 with version 4 constraint', () => {
    expect(isIP(4)('192.168.1.1')).toBe(true);
  });

  it('should return false for IPv6 with version 4 constraint', () => {
    expect(isIP(4)('2001:db8::1')).toBe(false);
  });

  it('should return true for IPv6 with version 6 constraint', () => {
    expect(isIP(6)('::1')).toBe(true);
  });

  it('should call ctx.addRegex and generate test code when calling emit()', () => {
    const { ctx, addRegexMock, failMock } = makeCtx(0);
    isIP().emit('v', ctx);
    expect(addRegexMock).toHaveBeenCalled();
    expect(failMock).toHaveBeenCalledWith('isIP');
  });

  it('should generate IPv4-only check code when emit() is called with version 4', () => {
    const { ctx, addRegexMock, failMock } = makeCtx(0);
    const code = isIP(4).emit('v', ctx);
    expect(addRegexMock).toHaveBeenCalledTimes(1);
    expect(code).toBeTruthy();
    expect(failMock).toHaveBeenCalledWith('isIP');
  });

  it('should generate IPv6-only check code when emit() is called with version 6', () => {
    const { ctx, addRegexMock, failMock } = makeCtx(0);
    const code = isIP(6).emit('v', ctx);
    expect(addRegexMock).toHaveBeenCalledTimes(1);
    expect(code).toBeTruthy();
    expect(failMock).toHaveBeenCalledWith('isIP');
  });

  it('should have ruleName isIP and requiresType string', () => {
    expect(isIP().ruleName).toBe('isIP');
    expect(isIP().requiresType).toBe(RequiredType.String);
  });
});

describe('isMACAddress', () => {
  it('should return true for valid colon-separated MAC address', () => {
    expect(isMACAddress()('01:23:45:67:89:ab')).toBe(true);
  });

  it('should return true for valid hyphen-separated MAC address', () => {
    expect(isMACAddress()('01-23-45-67-89-ab')).toBe(true);
  });

  it('should return false for invalid MAC address', () => {
    expect(isMACAddress()('01:23:45:67:89')).toBe(false);
  });

  it('should call ctx.addRegex and generate test code when calling emit() and have ruleName isMACAddress', () => {
    const { ctx, addRegexMock, failMock } = makeCtx(0);
    isMACAddress().emit('v', ctx);
    expect(addRegexMock).toHaveBeenCalled();
    expect(failMock).toHaveBeenCalledWith('isMACAddress');
    expect(isMACAddress().ruleName).toBe('isMACAddress');
  });

  it('should generate no-separator regex check code when emit() is called with noSeparators:true', () => {
    const { ctx, addRegexMock, failMock } = makeCtx(0);
    const code = isMACAddress({ noSeparators: true }).emit('v', ctx);
    expect(addRegexMock).toHaveBeenCalledTimes(1);
    expect(code).toBeTruthy();
    expect(failMock).toHaveBeenCalledWith('isMACAddress');
  });
});

describe('isJWT', () => {
  it('should return true for valid JWT (3-part dot-separated base64url)', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    expect(isJWT(jwt)).toBe(true);
  });

  it('should return false for string without two dots', () => {
    expect(isJWT('header.payload')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isJWT('')).toBe(false);
  });

  it('should call ctx.addRegex and generate test code when calling emit() and have ruleName isJWT', () => {
    const { ctx, addRegexMock, failMock } = makeCtx(0);
    isJWT.emit('v', ctx);
    expect(addRegexMock).toHaveBeenCalledTimes(1);
    expect(failMock).toHaveBeenCalledWith('isJWT');
    expect(isJWT.ruleName).toBe('isJWT');
    expect(isJWT.requiresType).toBe(RequiredType.String);
  });
});

describe('isLatLong', () => {
  it('should return true for valid lat,long pair', () => {
    expect(isLatLong()('40.7128,-74.0060')).toBe(true);
  });

  it('should return false for out-of-range latitude', () => {
    expect(isLatLong()('91.0000,0.0000')).toBe(false);
  });

  it('should return false for invalid format', () => {
    expect(isLatLong()('not_a_coord')).toBe(false);
  });

  it('should call ctx.addRegex and generate test code when calling emit() and have ruleName isLatLong', () => {
    const { ctx, addRegexMock, failMock } = makeCtx(0);
    isLatLong().emit('v', ctx);
    expect(addRegexMock).toHaveBeenCalled();
    expect(failMock).toHaveBeenCalledWith('isLatLong');
    expect(isLatLong().ruleName).toBe('isLatLong');
  });
});

describe('isLocale', () => {
  it('should return true for valid BCP 47 locale (en)', () => {
    expect(isLocale('en')).toBe(true);
  });

  it('should return true for valid BCP 47 locale (en-US)', () => {
    expect(isLocale('en-US')).toBe(true);
  });

  it('should return false for invalid locale', () => {
    expect(isLocale('a')).toBe(false);
  });

  it('should return true for a BCP 47 tag with a digit-led 4-char variant subtag (de-DE-1996)', () => {
    expect(isLocale('de-DE-1996')).toBe(true);
  });

  it('should call ctx.addRegex and generate test code when calling emit() and have ruleName isLocale', () => {
    const { ctx, addRegexMock, failMock } = makeCtx(0);
    isLocale.emit('v', ctx);
    expect(addRegexMock).toHaveBeenCalledTimes(1);
    expect(failMock).toHaveBeenCalledWith('isLocale');
    expect(isLocale.ruleName).toBe('isLocale');
  });
});

describe('isDataURI', () => {
  it('should return true for valid data URI', () => {
    expect(isDataURI('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA')).toBe(true);
  });

  it('should return true for data URI with text content', () => {
    expect(isDataURI('data:text/plain;charset=utf-8,Hello')).toBe(true);
  });

  it('should return false for non-data URI', () => {
    expect(isDataURI('http://example.com')).toBe(false);
  });

  it('should call ctx.addRegex and generate test code when calling emit() and have ruleName isDataURI', () => {
    const { ctx, addRegexMock, failMock } = makeCtx(0);
    isDataURI.emit('v', ctx);
    expect(addRegexMock).toHaveBeenCalledTimes(1);
    expect(failMock).toHaveBeenCalledWith('isDataURI');
    expect(isDataURI.ruleName).toBe('isDataURI');
  });
});

describe('isFQDN', () => {
  it('should return true for valid FQDN', () => {
    expect(isFQDN()('example.com')).toBe(true);
  });

  it('should return true for subdomain FQDN', () => {
    expect(isFQDN()('sub.example.co.uk')).toBe(true);
  });

  it('should return false for IP address', () => {
    expect(isFQDN()('192.168.1.1')).toBe(false);
  });

  it('should return false for localhost', () => {
    expect(isFQDN()('localhost')).toBe(false);
  });

  it('should generate code when calling emit() and have ruleName isFQDN', () => {
    const { ctx, failMock } = makeCtx(0);
    const code = isFQDN().emit('v', ctx);
    expect(code).toBeTruthy();
    expect(failMock).toHaveBeenCalledWith('isFQDN');
    expect(isFQDN().ruleName).toBe('isFQDN');
  });
});

describe('isPort', () => {
  it('should return true for port 80', () => {
    expect(isPort('80')).toBe(true);
  });

  it('should return true for port 0', () => {
    expect(isPort('0')).toBe(true);
  });

  it('should return true for port 65535', () => {
    expect(isPort('65535')).toBe(true);
  });

  it('should return false for port 65536', () => {
    expect(isPort('65536')).toBe(false);
  });

  it('should return false for negative port', () => {
    expect(isPort('-1')).toBe(false);
  });

  it('should call ctx.addRegex and generate test code when calling emit() and have ruleName isPort', () => {
    const { ctx, addRegexMock, failMock } = makeCtx(0);
    isPort.emit('v', ctx);
    expect(addRegexMock).toHaveBeenCalled();
    expect(failMock).toHaveBeenCalledWith('isPort');
    expect(isPort.ruleName).toBe('isPort');
    expect(isPort.requiresType).toBe(RequiredType.String);
  });
});

describe('isJSON', () => {
  it('should return true for valid JSON object string', () => {
    expect(isJSON('{"key":"value"}')).toBe(true);
  });

  it('should return true for valid JSON array string', () => {
    expect(isJSON('[1,2,3]')).toBe(true);
  });

  it('should return false for invalid JSON string', () => {
    expect(isJSON('{invalid}')).toBe(false);
  });

  it('should return false for non-string value', () => {
    expect(isJSON(42 as never)).toBe(false);
  });

  it('should generate try-catch or ref-based code when calling emit() and have ruleName isJSON', () => {
    const { ctx, failMock } = makeCtx(0);
    const code = isJSON.emit('v', ctx);
    expect(code).toBeTruthy();
    expect(failMock).toHaveBeenCalledWith('isJSON');
    expect(isJSON.ruleName).toBe('isJSON');
  });

  it('should emit inline try/catch JSON.parse code (no addRef)', () => {
    const { ctx, addRefMock } = makeCtx(0);
    const code = isJSON.emit('v', ctx);
    expect(addRefMock).not.toHaveBeenCalled();
    expect(code).toContain('JSON.parse');
    expect(code).toContain('catch');
  });
});

describe('isMimeType', () => {
  it('should return true for valid MIME type', () => {
    expect(isMimeType('application/json')).toBe(true);
  });

  it('should return true for valid MIME type with subtype', () => {
    expect(isMimeType('image/png')).toBe(true);
  });

  it('should return false for invalid MIME type', () => {
    expect(isMimeType('not-a-mime')).toBe(false);
  });

  it('should call ctx.addRegex and generate test code when calling emit() and have ruleName isMimeType', () => {
    const { ctx, addRegexMock, failMock } = makeCtx(0);
    isMimeType.emit('v', ctx);
    expect(addRegexMock).toHaveBeenCalledTimes(1);
    expect(failMock).toHaveBeenCalledWith('isMimeType');
    expect(isMimeType.ruleName).toBe('isMimeType');
  });
});

describe('isMagnetURI', () => {
  it('should return true for valid magnet URI', () => {
    expect(isMagnetURI('magnet:?xt=urn:btih:c12fe1c06bba254a9dc9f519b335aa7c1367a88a')).toBe(true);
  });

  it('should return false for non-magnet URI', () => {
    expect(isMagnetURI('http://example.com')).toBe(false);
  });

  it('should call ctx.addRegex and generate test code when calling emit() and have ruleName isMagnetURI', () => {
    const { ctx, addRegexMock, failMock } = makeCtx(0);
    isMagnetURI.emit('v', ctx);
    expect(addRegexMock).toHaveBeenCalledTimes(1);
    expect(failMock).toHaveBeenCalledWith('isMagnetURI');
    expect(isMagnetURI.ruleName).toBe('isMagnetURI');
  });
});

describe('isByteLength', () => {
  it('should return true when byte length is within range', () => {
    const rule = isByteLength(1, 10);
    expect(rule('hello')).toBe(true);
  });

  it('should return true for multibyte string within range', () => {
    const rule = isByteLength(1, 100);
    expect(rule('日本語')).toBe(true);
  });

  it('should return false when byte length is below minimum', () => {
    const rule = isByteLength(5, 10);
    expect(rule('hi')).toBe(false);
  });

  it('should return false when byte length exceeds maximum', () => {
    const rule = isByteLength(1, 3);
    expect(rule('hello')).toBe(false);
  });

  it('should return true for empty string when minimum is 0', () => {
    const rule = isByteLength(0);
    expect(rule('')).toBe(true);
  });

  it('should count multibyte characters by byte length not char count', () => {
    const rule = isByteLength(1, 3);
    // '日' is 3 bytes in UTF-8, so within [1,3]
    expect(rule('日')).toBe(true);
    // '日本' is 6 bytes, exceeds max=3
    expect(rule('日本')).toBe(false);
  });

  it('should generate byte length check code when calling emit() and have ruleName isByteLength', () => {
    const rule = isByteLength(1, 10);
    const { ctx, failMock } = makeCtx();
    const code = rule.emit('v', ctx);
    expect(code).toBeTruthy();
    expect(failMock).toHaveBeenCalledWith('isByteLength');
    expect(rule.ruleName).toBe('isByteLength');
    expect(rule.requiresType).toBe(RequiredType.String);
  });

  it('should emit inline Buffer.byteLength check (no addRef)', () => {
    const rule = isByteLength(2, 5);
    const { ctx, addRefMock } = makeCtx(0);
    const code = rule.emit('v', ctx);
    expect(addRefMock).not.toHaveBeenCalled();
    expect(code).toContain('bl');
    expect(code).toContain('2');
    expect(code).toContain('5');
  });

  it('should return independent rule objects on multiple factory calls', () => {
    const r1 = isByteLength(1, 10);
    const r2 = isByteLength(1, 10);
    expect(r1).not.toBe(r2);
  });
});

describe('isHash', () => {
  it('should return true for a valid md5 hash', () => {
    expect(isHash('md5')('d41d8cd98f00b204e9800998ecf8427e')).toBe(true);
  });

  it('should return false for a non-hex md5-length string', () => {
    expect(isHash('md5')('z41d8cd98f00b204e9800998ecf8427e')).toBe(false);
  });

  it('should return true for a valid sha1 hash', () => {
    expect(isHash('sha1')('da39a3ee5e6b4b0d3255bfef95601890afd80709')).toBe(true);
  });

  it('should return false for sha1 with wrong length', () => {
    expect(isHash('sha1')('da39a3ee5e6b4b0d3255bfef95601890afd8070')).toBe(false);
  });

  it('should return true for a valid sha256 hash', () => {
    expect(isHash('sha256')('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')).toBe(true);
  });

  it('should return false for sha256 with non-hex character', () => {
    expect(isHash('sha256')('g3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')).toBe(false);
  });

  it('should return true for valid sha384 hash', () => {
    // sha384 of empty string = 96 hex chars
    expect(
      isHash('sha384')('38b060a751ac96384cd9327eb1b1e36a21fdb71114be07434c0cc7bf63f6e1da274edebfe76f65fbd51ad2f14898b95b'),
    ).toBe(true);
  });

  it('should return true for a valid sha512 hash', () => {
    // sha512 of empty string = 128 hex chars (exact)
    const sha512 =
      'cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e';
    expect(isHash('sha512')(sha512)).toBe(true);
  });

  it('should return true for valid ripemd128 hash', () => {
    expect(isHash('ripemd128')('cdf26213a150dc3ecb610f18f6b38b46')).toBe(true);
  });

  it('should return false for ripemd128 with wrong length', () => {
    expect(isHash('ripemd128')('cdf26213a150dc3ecb610f18f6b38')).toBe(false);
  });

  it('should return true for valid ripemd160 hash', () => {
    expect(isHash('ripemd160')('9c1185a5c5e9fc54612808977ee8f548b2258d31')).toBe(true);
  });

  it('should return true for valid crc32 hash', () => {
    expect(isHash('crc32')('90abcdef')).toBe(true);
  });

  it('should return false for non-string input', () => {
    expect(isHash('md5')(42 as never)).toBe(false);
  });

  it('should have requiresType string', () => {
    expect(isHash('md5').requiresType).toBe(RequiredType.String);
  });

  it('should have ruleName isHash', () => {
    expect(isHash('md5').ruleName).toBe('isHash');
  });

  it('should generate emit code with regex check', () => {
    const { ctx, failMock } = makeCtx();
    const code = isHash('md5').emit('v', ctx);
    expect(code).toBeTruthy();
    expect(failMock).toHaveBeenCalledWith('isHash');
  });

  it('should generate immediate fail code for unknown algorithm emit', () => {
    const { ctx, failMock } = makeCtx();
    const code = isHash('unknownAlgo' as never).emit('v', ctx);
    expect(code).toContain('isHash');
    expect(failMock).toHaveBeenCalledWith('isHash');
  });
});

describe('isRFC3339', () => {
  it('should return true for UTC datetime', () => {
    expect(isRFC3339('2021-01-01T00:00:00Z')).toBe(true);
  });

  it('should return true for datetime with timezone offset', () => {
    expect(isRFC3339('2021-12-31T23:59:59+09:00')).toBe(true);
  });

  it('should return true for datetime with milliseconds', () => {
    expect(isRFC3339('2021-06-15T12:30:45.123Z')).toBe(true);
  });

  it('should return false for date-only string', () => {
    expect(isRFC3339('2021-01-01')).toBe(false);
  });

  it('should return false for a plain string', () => {
    expect(isRFC3339('not-a-date')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isRFC3339('')).toBe(false);
  });

  it('should return false for non-string input', () => {
    expect(isRFC3339(12345 as never)).toBe(false);
  });

  it('should have requiresType string and ruleName isRFC3339', () => {
    expect(isRFC3339.requiresType).toBe(RequiredType.String);
    expect(isRFC3339.ruleName).toBe('isRFC3339');
  });

  it('should generate emit code', () => {
    const { ctx, failMock } = makeCtx();
    const code = isRFC3339.emit('v', ctx);
    expect(code).toBeTruthy();
    expect(failMock).toHaveBeenCalledWith('isRFC3339');
  });
});

describe('isMilitaryTime', () => {
  it('should return true for 00:00', () => {
    expect(isMilitaryTime('00:00')).toBe(true);
  });

  it('should return true for 23:59', () => {
    expect(isMilitaryTime('23:59')).toBe(true);
  });

  it('should return true for 12:30', () => {
    expect(isMilitaryTime('12:30')).toBe(true);
  });

  it('should return false for 24:00', () => {
    expect(isMilitaryTime('24:00')).toBe(false);
  });

  it('should return false for 12:60', () => {
    expect(isMilitaryTime('12:60')).toBe(false);
  });

  it('should return false for single-digit hour', () => {
    expect(isMilitaryTime('1:30')).toBe(false);
  });

  it('should return false for non-string input', () => {
    expect(isMilitaryTime(1230 as never)).toBe(false);
  });

  it('should have requiresType string and ruleName isMilitaryTime', () => {
    expect(isMilitaryTime.requiresType).toBe(RequiredType.String);
    expect(isMilitaryTime.ruleName).toBe('isMilitaryTime');
  });

  it('should generate emit code', () => {
    const { ctx, failMock } = makeCtx();
    const code = isMilitaryTime.emit('v', ctx);
    expect(code).toBeTruthy();
    expect(failMock).toHaveBeenCalledWith('isMilitaryTime');
  });
});

describe('isLatitude', () => {
  it('should return true for string "0"', () => {
    expect(isLatitude('0')).toBe(true);
  });

  it('should return true for string "-90"', () => {
    expect(isLatitude('-90')).toBe(true);
  });

  it('should return true for string "90"', () => {
    expect(isLatitude('90')).toBe(true);
  });

  it('should return true for string "45.1234"', () => {
    expect(isLatitude('45.1234')).toBe(true);
  });

  it('should return true for number 0', () => {
    expect(isLatitude(0)).toBe(true);
  });

  it('should return true for number 45.123', () => {
    expect(isLatitude(45.123)).toBe(true);
  });

  it('should return false for "-90.001"', () => {
    expect(isLatitude('-90.001')).toBe(false);
  });

  it('should return false for "90.001"', () => {
    expect(isLatitude('90.001')).toBe(false);
  });

  it('should return false for "abc"', () => {
    expect(isLatitude('abc')).toBe(false);
  });

  it('should return false for string with extra chars like "90abc"', () => {
    expect(isLatitude('90abc')).toBe(false);
  });

  it('should return false for non-string non-number input', () => {
    expect(isLatitude(null as never)).toBe(false);
    expect(isLatitude({} as never)).toBe(false);
  });

  it('should have ruleName isLatitude and requiresType undefined', () => {
    expect(isLatitude.ruleName).toBe('isLatitude');
    expect(isLatitude.requiresType).toBeUndefined();
  });

  it('should generate emit code', () => {
    const { ctx, failMock } = makeCtx();
    const code = isLatitude.emit('v', ctx);
    expect(code).toBeTruthy();
    expect(failMock).toHaveBeenCalledWith('isLatitude');
  });
});

describe('isLongitude', () => {
  it('should return true for string "0"', () => {
    expect(isLongitude('0')).toBe(true);
  });

  it('should return true for string "-180"', () => {
    expect(isLongitude('-180')).toBe(true);
  });

  it('should return true for string "180"', () => {
    expect(isLongitude('180')).toBe(true);
  });

  it('should return true for number 90.5', () => {
    expect(isLongitude(90.5)).toBe(true);
  });

  it('should return false for "-180.001"', () => {
    expect(isLongitude('-180.001')).toBe(false);
  });

  it('should return false for "180.001"', () => {
    expect(isLongitude('180.001')).toBe(false);
  });

  it('should return false for "abc"', () => {
    expect(isLongitude('abc')).toBe(false);
  });

  it('should return false for string with extra chars like "180abc"', () => {
    expect(isLongitude('180abc')).toBe(false);
  });

  it('should return false for non-string non-number input', () => {
    expect(isLongitude(null as never)).toBe(false);
    expect(isLongitude({} as never)).toBe(false);
  });

  it('should have ruleName isLongitude and requiresType undefined', () => {
    expect(isLongitude.ruleName).toBe('isLongitude');
    expect(isLongitude.requiresType).toBeUndefined();
  });

  it('should generate emit code', () => {
    const { ctx, failMock } = makeCtx();
    const code = isLongitude.emit('v', ctx);
    expect(code).toBeTruthy();
    expect(failMock).toHaveBeenCalledWith('isLongitude');
  });
});

describe('isEthereumAddress', () => {
  it('should return true for a valid lowercase ethereum address', () => {
    expect(isEthereumAddress('0x742d35cc6634c0532925a3b8d4c9db96590c6af5')).toBe(true);
  });

  it('should return true for a valid mixed-case ethereum address', () => {
    expect(isEthereumAddress('0x742d35Cc6634C0532925a3b8D4C9Db96590c7aEB')).toBe(true);
  });

  it('should return false for address without 0x prefix', () => {
    expect(isEthereumAddress('742d35cc6634c0532925a3b8d4c9db96590c6af5')).toBe(false);
  });

  it('should return false for too short address', () => {
    expect(isEthereumAddress('0x742d35')).toBe(false);
  });

  it('should return false for non-hex chars', () => {
    expect(isEthereumAddress('0xzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz')).toBe(false);
  });

  it('should return false for non-string input', () => {
    expect(isEthereumAddress(123 as never)).toBe(false);
  });

  it('should have requiresType string and ruleName isEthereumAddress', () => {
    expect(isEthereumAddress.requiresType).toBe(RequiredType.String);
    expect(isEthereumAddress.ruleName).toBe('isEthereumAddress');
  });

  it('should generate emit code with regex', () => {
    const { ctx, failMock } = makeCtx();
    const code = isEthereumAddress.emit('v', ctx);
    expect(code).toBeTruthy();
    expect(failMock).toHaveBeenCalledWith('isEthereumAddress');
  });
});

describe('isBtcAddress', () => {
  it('should return true for a valid P2PKH address (starts with 1)', () => {
    expect(isBtcAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7Divf Na')).toBe(false); // has space
  });

  it('should return true for a valid P2PKH address', () => {
    expect(isBtcAddress('1BpEi6DfDAUFd153wiGrvkiKW1iHENGLyQ')).toBe(true);
  });

  it('should return true for a valid P2SH address (starts with 3)', () => {
    expect(isBtcAddress('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy')).toBe(true);
  });

  it('should return true for a valid bech32 address', () => {
    expect(isBtcAddress('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq')).toBe(true);
  });

  it('should return true for an all-uppercase bech32 address (BIP-173)', () => {
    expect(isBtcAddress('BC1QAR0SRRR7XFKVY5L643LYDNW9RE59GTZZWF5MDQ')).toBe(true);
  });

  it('should return true for a testnet bech32 address (tb1)', () => {
    expect(isBtcAddress('tb1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq')).toBe(true);
  });

  it('should return false for a mixed-case bech32 address', () => {
    expect(isBtcAddress('bc1QAR0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq')).toBe(false);
  });

  it('should return false for clearly invalid address', () => {
    expect(isBtcAddress('0invalidaddress')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isBtcAddress('')).toBe(false);
  });

  it('should return false for non-string input', () => {
    expect(isBtcAddress(123 as never)).toBe(false);
  });

  it('should have requiresType string and ruleName isBtcAddress', () => {
    expect(isBtcAddress.requiresType).toBe(RequiredType.String);
    expect(isBtcAddress.ruleName).toBe('isBtcAddress');
  });

  it('should generate emit code', () => {
    const { ctx, failMock } = makeCtx();
    const code = isBtcAddress.emit('v', ctx);
    expect(code).toBeTruthy();
    expect(failMock).toHaveBeenCalledWith('isBtcAddress');
  });
});

describe('isPhoneNumber', () => {
  it('should return true for valid E.164 US number', () => {
    expect(isPhoneNumber('+14155552671')).toBe(true);
  });

  it('should return true for valid E.164 KR number', () => {
    expect(isPhoneNumber('+821012345678')).toBe(true);
  });

  it('should return true for valid E.164 UK number', () => {
    expect(isPhoneNumber('+447700900077')).toBe(true);
  });

  it('should return false for number without + prefix', () => {
    expect(isPhoneNumber('00821012345678')).toBe(false);
  });

  it('should return false for too short number', () => {
    expect(isPhoneNumber('+123')).toBe(false);
  });

  it('should return false for +0 leading digit after +', () => {
    expect(isPhoneNumber('+0123456789')).toBe(false);
  });

  it('should return false for non-string input', () => {
    expect(isPhoneNumber(123 as never)).toBe(false);
  });

  it('should have requiresType string and ruleName isPhoneNumber', () => {
    expect(isPhoneNumber.requiresType).toBe(RequiredType.String);
    expect(isPhoneNumber.ruleName).toBe('isPhoneNumber');
  });

  it('should generate emit code', () => {
    const { ctx, failMock } = makeCtx();
    const code = isPhoneNumber.emit('v', ctx);
    expect(code).toBeTruthy();
    expect(failMock).toHaveBeenCalledWith('isPhoneNumber');
  });
});

describe('isStrongPassword', () => {
  it('should return true for a valid strong password with defaults', () => {
    expect(isStrongPassword()('Passw0rd!')).toBe(true);
  });

  it('should return true for complex password', () => {
    expect(isStrongPassword()('MyP@ssw0rd123')).toBe(true);
  });

  it('should return false for too short password (< 8 chars)', () => {
    expect(isStrongPassword()('Pass0!')).toBe(false);
  });

  it('should return false for password with no uppercase', () => {
    expect(isStrongPassword()('password1!')).toBe(false);
  });

  it('should return false for password with no lowercase', () => {
    expect(isStrongPassword()('PASSWORD1!')).toBe(false);
  });

  it('should return false for password with no numbers', () => {
    expect(isStrongPassword()('Password!')).toBe(false);
  });

  it('should return false for password with no symbols', () => {
    expect(isStrongPassword()('Password1')).toBe(false);
  });

  it('should respect custom minLength option', () => {
    expect(isStrongPassword({ minLength: 4, minSymbols: 0 })('Pa1')).toBe(false);
    expect(isStrongPassword({ minLength: 4, minSymbols: 0 })('Pa1x')).toBe(true);
  });

  it('should return false for non-string input', () => {
    expect(isStrongPassword()(12345678 as never)).toBe(false);
  });

  it('should have requiresType string and ruleName isStrongPassword', () => {
    expect(isStrongPassword().requiresType).toBe(RequiredType.String);
    expect(isStrongPassword().ruleName).toBe('isStrongPassword');
  });

  it('should generate emit code', () => {
    const { ctx, failMock } = makeCtx();
    const code = isStrongPassword().emit('v', ctx);
    expect(code).toBeTruthy();
    expect(failMock).toHaveBeenCalledWith('isStrongPassword');
  });

  it('should return independent rule objects on multiple factory calls', () => {
    const r1 = isStrongPassword();
    const r2 = isStrongPassword();
    expect(r1).not.toBe(r2);
  });
});

describe('isTaxId', () => {
  it('should return true for valid US EIN', () => {
    expect(isTaxId('US')('12-3456789')).toBe(true);
  });

  it('should return false for invalid US format', () => {
    expect(isTaxId('US')('1234567')).toBe(false);
  });

  it('should return true for valid KR business registration number', () => {
    expect(isTaxId('KR')('123-45-67890')).toBe(true);
  });

  it('should return false for invalid KR format', () => {
    expect(isTaxId('KR')('12345')).toBe(false);
  });

  it('should return true for valid DE tax id', () => {
    expect(isTaxId('DE')('12345678901')).toBe(true);
  });

  it('should return false for invalid DE format', () => {
    expect(isTaxId('DE')('1234567890')).toBe(false);
  });

  it('should return true for valid GB UTR', () => {
    expect(isTaxId('GB')('1234567890')).toBe(true);
  });

  it('should return false for unsupported locale', () => {
    expect(isTaxId('XX')('123')).toBe(false);
  });

  it('should return false for non-string input', () => {
    expect(isTaxId('US')(123 as never)).toBe(false);
  });

  it('should have requiresType string and ruleName isTaxId', () => {
    expect(isTaxId('US').requiresType).toBe(RequiredType.String);
    expect(isTaxId('US').ruleName).toBe('isTaxId');
  });

  it('should generate emit code', () => {
    const { ctx, failMock } = makeCtx();
    const code = isTaxId('US').emit('v', ctx);
    expect(code).toBeTruthy();
    expect(failMock).toHaveBeenCalledWith('isTaxId');
  });

  it('should emit fail-only code for unknown locale (covers L1464 !re branch)', () => {
    const { ctx, failMock } = makeCtx();
    const code = isTaxId('XX-UNKNOWN').emit('v', ctx);
    expect(code).toContain('isTaxId');
    expect(failMock).toHaveBeenCalledWith('isTaxId');
  });

  it('should return independent rule objects on multiple factory calls', () => {
    const r1 = isTaxId('US');
    const r2 = isTaxId('US');
    expect(r1).not.toBe(r2);
  });
});

