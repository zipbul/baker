import { describe, it, expect } from 'bun:test';
import { deserialize, isBakerError, Field } from '../../index';
import {
  isAscii, isAlpha, isAlphanumeric, isNumberString, isDecimal,
  isFullWidth, isHalfWidth, isVariableWidth, isMultibyte, isSurrogatePair,
  isHexadecimal, isOctal,
  isHexColor, isRgbColor, isHSL, isMACAddress,
  isISBN, isISIN, isISRC, isISSN, isJWT,
  isLatLong, isLocale, isDataURI, isFQDN, isPort,
  isISO31661Alpha2, isISO31661Alpha3, isBIC, isSemVer, isMongoId,
  isBase64, isBase58, isBase32, isMimeType, isCreditCard, isIBAN,
  isByteLength, isHash, isRFC3339, isMilitaryTime,
  isLatitude, isLongitude, isEthereumAddress, isBtcAddress,
  isISO4217CurrencyCode, isPhoneNumber, isStrongPassword, isTaxId,
  isFirebasePushId, isEAN, isMagnetURI, isDateString, isCurrency,
} from '../../src/rules/index';
// ─────────────────────────────────────────────────────────────────────────────

describe('isAscii', () => {
  class D { @Field(isAscii) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: 'hello' }) as D).v).toBe('hello'); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: '한글' }))).toBe(true); });
});

describe('isAlpha', () => {
  class D { @Field(isAlpha) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: 'abc' }) as D).v).toBe('abc'); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: 'abc123' }))).toBe(true); });
});

describe('isAlphanumeric', () => {
  class D { @Field(isAlphanumeric) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: 'abc123' }) as D).v).toBe('abc123'); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: 'abc-123' }))).toBe(true); });
});

describe('isNumberString', () => {
  class D { @Field(isNumberString()) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: '123.45' }) as D).v).toBe('123.45'); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: 'abc' }))).toBe(true); });
});

describe('isDecimal', () => {
  class D { @Field(isDecimal()) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: '3.14' }) as D).v).toBe('3.14'); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: 'abc' }))).toBe(true); });
});

describe('isFullWidth', () => {
  class D { @Field(isFullWidth) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: '\uff41\uff42\uff43' }) as D).v).toBe('\uff41\uff42\uff43'); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: 'abc' }))).toBe(true); });
});

describe('isHalfWidth', () => {
  class D { @Field(isHalfWidth) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: 'abc' }) as D).v).toBe('abc'); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: '\uff41\uff42\uff43' }))).toBe(true); });
});

describe('isMultibyte', () => {
  class D { @Field(isMultibyte) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: '\ud55c\uae00\u30c6\u30b9\u30c8' }) as D).v).toBe('\ud55c\uae00\u30c6\u30b9\u30c8'); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: 'abc' }))).toBe(true); });
});

describe('isHexadecimal', () => {
  class D { @Field(isHexadecimal) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: 'deadBEEF' }) as D).v).toBe('deadBEEF'); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: 'xyz' }))).toBe(true); });
});

describe('isOctal', () => {
  class D { @Field(isOctal) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: '0o777' }) as D).v).toBe('0o777'); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: '999' }))).toBe(true); });
});

describe('isHexColor', () => {
  class D { @Field(isHexColor) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: '#ff0000' }) as D).v).toBe('#ff0000'); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: 'red' }))).toBe(true); });
});

describe('isRgbColor', () => {
  class D { @Field(isRgbColor()) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: 'rgb(255,0,0)' }) as D).v).toBe('rgb(255,0,0)'); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: 'red' }))).toBe(true); });
});

describe('isHSL', () => {
  class D { @Field(isHSL) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: 'hsl(0,100%,50%)' }) as D).v).toBe('hsl(0,100%,50%)'); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: 'red' }))).toBe(true); });
});

describe('isMACAddress', () => {
  class D { @Field(isMACAddress()) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: 'AA:BB:CC:DD:EE:FF' }) as D).v).toBe('AA:BB:CC:DD:EE:FF'); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: 'invalid' }))).toBe(true); });
});

describe('isISBN', () => {
  class D { @Field(isISBN(13)) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: '9780306406157' }) as D).v).toBe('9780306406157'); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: '123' }))).toBe(true); });
});

describe('isISIN', () => {
  class D { @Field(isISIN) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: 'US0378331005' }) as D).v).toBe('US0378331005'); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: 'invalid' }))).toBe(true); });
});

describe('isISRC', () => {
  class D { @Field(isISRC) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: 'USRC17607839' }) as D).v).toBe('USRC17607839'); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: 'invalid' }))).toBe(true); });
});

describe('isISSN', () => {
  class D { @Field(isISSN()) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: '0378-5955' }) as D).v).toBe('0378-5955'); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: '1234' }))).toBe(true); });
});

describe('isJWT', () => {
  class D { @Field(isJWT) v!: string; }
  const validJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
  it('passes', async () => { expect((await deserialize(D, { v: validJwt }) as D).v).toBe(validJwt); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: 'hello' }))).toBe(true); });
});

describe('isLatLong', () => {
  class D { @Field(isLatLong()) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: '37.7749,-122.4194' }) as D).v).toBe('37.7749,-122.4194'); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: 'invalid' }))).toBe(true); });
});

describe('isLocale', () => {
  class D { @Field(isLocale) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: 'en-US' }) as D).v).toBe('en-US'); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: '!!!' }))).toBe(true); });
});

describe('isDataURI', () => {
  class D { @Field(isDataURI) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: 'data:text/plain;base64,SGVsbG8=' }) as D).v).toContain('data:'); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: 'not-data-uri' }))).toBe(true); });
});

describe('isFQDN', () => {
  class D { @Field(isFQDN()) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: 'example.com' }) as D).v).toBe('example.com'); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: 'not_a_domain' }))).toBe(true); });
});

describe('isPort', () => {
  class D { @Field(isPort) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: '8080' }) as D).v).toBe('8080'); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: '99999' }))).toBe(true); });
});

describe('isISO31661Alpha2', () => {
  class D { @Field(isISO31661Alpha2) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: 'US' }) as D).v).toBe('US'); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: 'ZZ' }))).toBe(true); });
});

describe('isISO31661Alpha3', () => {
  class D { @Field(isISO31661Alpha3) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: 'USA' }) as D).v).toBe('USA'); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: 'ZZZ' }))).toBe(true); });
});

describe('isBIC', () => {
  class D { @Field(isBIC) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: 'DEUTDEFF' }) as D).v).toBe('DEUTDEFF'); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: 'invalid' }))).toBe(true); });
});

describe('isSemVer', () => {
  class D { @Field(isSemVer) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: '1.2.3' }) as D).v).toBe('1.2.3'); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: 'abc' }))).toBe(true); });
});

describe('isMongoId', () => {
  class D { @Field(isMongoId) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: '507f1f77bcf86cd799439011' }) as D).v).toBe('507f1f77bcf86cd799439011'); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: 'short' }))).toBe(true); });
});

describe('isBase64', () => {
  class D { @Field(isBase64()) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: 'SGVsbG8=' }) as D).v).toBe('SGVsbG8='); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: '!!!' }))).toBe(true); });
});

describe('isBase58', () => {
  class D { @Field(isBase58) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: '3J98t1WpEZ' }) as D).v).toBe('3J98t1WpEZ'); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: '0OIl' }))).toBe(true); });
});

describe('isMimeType', () => {
  class D { @Field(isMimeType) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: 'application/json' }) as D).v).toBe('application/json'); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: 'not-mime' }))).toBe(true); });
});

describe('isCreditCard', () => {
  class D { @Field(isCreditCard) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: '4111111111111111' }) as D).v).toBe('4111111111111111'); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: '1234' }))).toBe(true); });
});

describe('isByteLength', () => {
  class D { @Field(isByteLength(1, 10)) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: 'hello' }) as D).v).toBe('hello'); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: '' }))).toBe(true); });
});

describe('isHash', () => {
  class D { @Field(isHash('md5')) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: 'd41d8cd98f00b204e9800998ecf8427e' }) as D).v).toBeDefined(); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: 'nothash' }))).toBe(true); });
});

describe('isRFC3339', () => {
  class D { @Field(isRFC3339) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: '2024-01-01T00:00:00Z' }) as D).v).toBeDefined(); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: 'not-date' }))).toBe(true); });
});

describe('isMilitaryTime', () => {
  class D { @Field(isMilitaryTime) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: '23:59' }) as D).v).toBe('23:59'); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: '25:00' }))).toBe(true); });
});

describe('isLatitude', () => {
  class D { @Field(isLatitude) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: '37.7749' }) as D).v).toBe('37.7749'); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: '100.0' }))).toBe(true); });
});

describe('isLongitude', () => {
  class D { @Field(isLongitude) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: '-122.4194' }) as D).v).toBe('-122.4194'); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: '200.0' }))).toBe(true); });
});

describe('isEthereumAddress', () => {
  class D { @Field(isEthereumAddress) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68' }) as D).v).toBeDefined(); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: '0xinvalid' }))).toBe(true); });
});

describe('isBtcAddress', () => {
  class D { @Field(isBtcAddress) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa' }) as D).v).toBeDefined(); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: 'invalid' }))).toBe(true); });
});

describe('isISO4217CurrencyCode', () => {
  class D { @Field(isISO4217CurrencyCode) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: 'USD' }) as D).v).toBe('USD'); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: 'ZZZ' }))).toBe(true); });
});

describe('isPhoneNumber', () => {
  class D { @Field(isPhoneNumber) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: '+14155552671' }) as D).v).toBeDefined(); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: 'abc' }))).toBe(true); });
});

describe('isStrongPassword', () => {
  class D { @Field(isStrongPassword()) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: 'Str0ng!Pass' }) as D).v).toBeDefined(); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: 'weak' }))).toBe(true); });
});

describe('isFirebasePushId', () => {
  class D { @Field(isFirebasePushId) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: '-JhLeOlGIEjaIOFHR0xd' }) as D).v).toBeDefined(); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: 'short' }))).toBe(true); });
});

describe('isEAN', () => {
  class D { @Field(isEAN) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: '4006381333931' }) as D).v).toBeDefined(); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: '123' }))).toBe(true); });
});

describe('isMagnetURI', () => {
  class D { @Field(isMagnetURI) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: 'magnet:?xt=urn:btih:c12fe1c06bba254a9dc9f519b335aa7c1367a88a' }) as D).v).toBeDefined(); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: 'notmagnet' }))).toBe(true); });
});

describe('isDateString', () => {
  class D { @Field(isDateString()) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: '2024-01-01' }) as D).v).toBe('2024-01-01'); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: 'notdate' }))).toBe(true); });
});

describe('isCurrency', () => {
  class D { @Field(isCurrency()) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: '$1,000.00' }) as D).v).toBeDefined(); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: 'abc' }))).toBe(true); });
});

describe('isVariableWidth', () => {
  class D { @Field(isVariableWidth) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: '\uff41b\uff43' }) as D).v).toBe('\uff41b\uff43'); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: 'abc' }))).toBe(true); });
});

describe('isSurrogatePair', () => {
  class D { @Field(isSurrogatePair) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: '\ud842\udfb7' }) as D).v).toBe('\ud842\udfb7'); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: 'abc' }))).toBe(true); });
});

describe('isBase32', () => {
  class D { @Field(isBase32()) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: 'JBSWY3DPEHPK3PXP' }) as D).v).toBe('JBSWY3DPEHPK3PXP'); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: '!!invalid!!' }))).toBe(true); });
});

describe('isIBAN', () => {
  class D { @Field(isIBAN()) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: 'DE89370400440532013000' }) as D).v).toBe('DE89370400440532013000'); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: 'invalid' }))).toBe(true); });
});

describe('isTaxId', () => {
  class D { @Field(isTaxId('US')) v!: string; }
  it('passes', async () => { expect((await deserialize(D, { v: '12-3456789' }) as D).v).toBe('12-3456789'); });
  it('rejected', async () => { expect(isBakerError(await deserialize(D, { v: 'invalid' }))).toBe(true); });
});
