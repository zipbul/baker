import { describe, it, expect } from 'bun:test';
import { deserialize, BakerValidationError, Field } from '../../index';
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
  it('passes', async () => { expect((await deserialize<D>(D, { v: 'hello' })).v).toBe('hello'); });
  it('rejected', async () => { await expect(deserialize(D, { v: '한글' })).rejects.toThrow(BakerValidationError); });
});

describe('isAlpha', () => {
  class D { @Field(isAlpha) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: 'abc' })).v).toBe('abc'); });
  it('rejected', async () => { await expect(deserialize(D, { v: 'abc123' })).rejects.toThrow(BakerValidationError); });
});

describe('isAlphanumeric', () => {
  class D { @Field(isAlphanumeric) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: 'abc123' })).v).toBe('abc123'); });
  it('rejected', async () => { await expect(deserialize(D, { v: 'abc-123' })).rejects.toThrow(BakerValidationError); });
});

describe('isNumberString', () => {
  class D { @Field(isNumberString()) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: '123.45' })).v).toBe('123.45'); });
  it('rejected', async () => { await expect(deserialize(D, { v: 'abc' })).rejects.toThrow(BakerValidationError); });
});

describe('isDecimal', () => {
  class D { @Field(isDecimal()) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: '3.14' })).v).toBe('3.14'); });
  it('rejected', async () => { await expect(deserialize(D, { v: 'abc' })).rejects.toThrow(BakerValidationError); });
});

describe('isFullWidth', () => {
  class D { @Field(isFullWidth) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: '\uff41\uff42\uff43' })).v).toBe('\uff41\uff42\uff43'); });
  it('rejected', async () => { await expect(deserialize(D, { v: 'abc' })).rejects.toThrow(BakerValidationError); });
});

describe('isHalfWidth', () => {
  class D { @Field(isHalfWidth) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: 'abc' })).v).toBe('abc'); });
  it('rejected', async () => { await expect(deserialize(D, { v: '\uff41\uff42\uff43' })).rejects.toThrow(BakerValidationError); });
});

describe('isMultibyte', () => {
  class D { @Field(isMultibyte) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: '\ud55c\uae00\u30c6\u30b9\u30c8' })).v).toBe('\ud55c\uae00\u30c6\u30b9\u30c8'); });
  it('rejected', async () => { await expect(deserialize(D, { v: 'abc' })).rejects.toThrow(BakerValidationError); });
});

describe('isHexadecimal', () => {
  class D { @Field(isHexadecimal) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: 'deadBEEF' })).v).toBe('deadBEEF'); });
  it('rejected', async () => { await expect(deserialize(D, { v: 'xyz' })).rejects.toThrow(BakerValidationError); });
});

describe('isOctal', () => {
  class D { @Field(isOctal) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: '0o777' })).v).toBe('0o777'); });
  it('rejected', async () => { await expect(deserialize(D, { v: '999' })).rejects.toThrow(BakerValidationError); });
});

describe('isHexColor', () => {
  class D { @Field(isHexColor) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: '#ff0000' })).v).toBe('#ff0000'); });
  it('rejected', async () => { await expect(deserialize(D, { v: 'red' })).rejects.toThrow(BakerValidationError); });
});

describe('isRgbColor', () => {
  class D { @Field(isRgbColor()) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: 'rgb(255,0,0)' })).v).toBe('rgb(255,0,0)'); });
  it('rejected', async () => { await expect(deserialize(D, { v: 'red' })).rejects.toThrow(BakerValidationError); });
});

describe('isHSL', () => {
  class D { @Field(isHSL) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: 'hsl(0,100%,50%)' })).v).toBe('hsl(0,100%,50%)'); });
  it('rejected', async () => { await expect(deserialize(D, { v: 'red' })).rejects.toThrow(BakerValidationError); });
});

describe('isMACAddress', () => {
  class D { @Field(isMACAddress()) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: 'AA:BB:CC:DD:EE:FF' })).v).toBe('AA:BB:CC:DD:EE:FF'); });
  it('rejected', async () => { await expect(deserialize(D, { v: 'invalid' })).rejects.toThrow(BakerValidationError); });
});

describe('isISBN', () => {
  class D { @Field(isISBN(13)) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: '9780306406157' })).v).toBe('9780306406157'); });
  it('rejected', async () => { await expect(deserialize(D, { v: '123' })).rejects.toThrow(BakerValidationError); });
});

describe('isISIN', () => {
  class D { @Field(isISIN) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: 'US0378331005' })).v).toBe('US0378331005'); });
  it('rejected', async () => { await expect(deserialize(D, { v: 'invalid' })).rejects.toThrow(BakerValidationError); });
});

describe('isISRC', () => {
  class D { @Field(isISRC) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: 'USRC17607839' })).v).toBe('USRC17607839'); });
  it('rejected', async () => { await expect(deserialize(D, { v: 'invalid' })).rejects.toThrow(BakerValidationError); });
});

describe('isISSN', () => {
  class D { @Field(isISSN()) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: '0378-5955' })).v).toBe('0378-5955'); });
  it('rejected', async () => { await expect(deserialize(D, { v: '1234' })).rejects.toThrow(BakerValidationError); });
});

describe('isJWT', () => {
  class D { @Field(isJWT) v!: string; }
  const validJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
  it('passes', async () => { expect((await deserialize<D>(D, { v: validJwt })).v).toBe(validJwt); });
  it('rejected', async () => { await expect(deserialize(D, { v: 'hello' })).rejects.toThrow(BakerValidationError); });
});

describe('isLatLong', () => {
  class D { @Field(isLatLong()) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: '37.7749,-122.4194' })).v).toBe('37.7749,-122.4194'); });
  it('rejected', async () => { await expect(deserialize(D, { v: 'invalid' })).rejects.toThrow(BakerValidationError); });
});

describe('isLocale', () => {
  class D { @Field(isLocale) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: 'en-US' })).v).toBe('en-US'); });
  it('rejected', async () => { await expect(deserialize(D, { v: '!!!' })).rejects.toThrow(BakerValidationError); });
});

describe('isDataURI', () => {
  class D { @Field(isDataURI) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: 'data:text/plain;base64,SGVsbG8=' })).v).toContain('data:'); });
  it('rejected', async () => { await expect(deserialize(D, { v: 'not-data-uri' })).rejects.toThrow(BakerValidationError); });
});

describe('isFQDN', () => {
  class D { @Field(isFQDN()) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: 'example.com' })).v).toBe('example.com'); });
  it('rejected', async () => { await expect(deserialize(D, { v: 'not_a_domain' })).rejects.toThrow(BakerValidationError); });
});

describe('isPort', () => {
  class D { @Field(isPort) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: '8080' })).v).toBe('8080'); });
  it('rejected', async () => { await expect(deserialize(D, { v: '99999' })).rejects.toThrow(BakerValidationError); });
});

describe('isISO31661Alpha2', () => {
  class D { @Field(isISO31661Alpha2) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: 'US' })).v).toBe('US'); });
  it('rejected', async () => { await expect(deserialize(D, { v: 'ZZ' })).rejects.toThrow(BakerValidationError); });
});

describe('isISO31661Alpha3', () => {
  class D { @Field(isISO31661Alpha3) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: 'USA' })).v).toBe('USA'); });
  it('rejected', async () => { await expect(deserialize(D, { v: 'ZZZ' })).rejects.toThrow(BakerValidationError); });
});

describe('isBIC', () => {
  class D { @Field(isBIC) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: 'DEUTDEFF' })).v).toBe('DEUTDEFF'); });
  it('rejected', async () => { await expect(deserialize(D, { v: 'invalid' })).rejects.toThrow(BakerValidationError); });
});

describe('isSemVer', () => {
  class D { @Field(isSemVer) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: '1.2.3' })).v).toBe('1.2.3'); });
  it('rejected', async () => { await expect(deserialize(D, { v: 'abc' })).rejects.toThrow(BakerValidationError); });
});

describe('isMongoId', () => {
  class D { @Field(isMongoId) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: '507f1f77bcf86cd799439011' })).v).toBe('507f1f77bcf86cd799439011'); });
  it('rejected', async () => { await expect(deserialize(D, { v: 'short' })).rejects.toThrow(BakerValidationError); });
});

describe('isBase64', () => {
  class D { @Field(isBase64()) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: 'SGVsbG8=' })).v).toBe('SGVsbG8='); });
  it('rejected', async () => { await expect(deserialize(D, { v: '!!!' })).rejects.toThrow(BakerValidationError); });
});

describe('isBase58', () => {
  class D { @Field(isBase58) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: '3J98t1WpEZ' })).v).toBe('3J98t1WpEZ'); });
  it('rejected', async () => { await expect(deserialize(D, { v: '0OIl' })).rejects.toThrow(BakerValidationError); });
});

describe('isMimeType', () => {
  class D { @Field(isMimeType) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: 'application/json' })).v).toBe('application/json'); });
  it('rejected', async () => { await expect(deserialize(D, { v: 'not-mime' })).rejects.toThrow(BakerValidationError); });
});

describe('isCreditCard', () => {
  class D { @Field(isCreditCard) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: '4111111111111111' })).v).toBe('4111111111111111'); });
  it('rejected', async () => { await expect(deserialize(D, { v: '1234' })).rejects.toThrow(BakerValidationError); });
});

describe('isByteLength', () => {
  class D { @Field(isByteLength(1, 10)) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: 'hello' })).v).toBe('hello'); });
  it('rejected', async () => { await expect(deserialize(D, { v: '' })).rejects.toThrow(BakerValidationError); });
});

describe('isHash', () => {
  class D { @Field(isHash('md5')) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: 'd41d8cd98f00b204e9800998ecf8427e' })).v).toBeDefined(); });
  it('rejected', async () => { await expect(deserialize(D, { v: 'nothash' })).rejects.toThrow(BakerValidationError); });
});

describe('isRFC3339', () => {
  class D { @Field(isRFC3339) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: '2024-01-01T00:00:00Z' })).v).toBeDefined(); });
  it('rejected', async () => { await expect(deserialize(D, { v: 'not-date' })).rejects.toThrow(BakerValidationError); });
});

describe('isMilitaryTime', () => {
  class D { @Field(isMilitaryTime) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: '23:59' })).v).toBe('23:59'); });
  it('rejected', async () => { await expect(deserialize(D, { v: '25:00' })).rejects.toThrow(BakerValidationError); });
});

describe('isLatitude', () => {
  class D { @Field(isLatitude) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: '37.7749' })).v).toBe('37.7749'); });
  it('rejected', async () => { await expect(deserialize(D, { v: '100.0' })).rejects.toThrow(BakerValidationError); });
});

describe('isLongitude', () => {
  class D { @Field(isLongitude) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: '-122.4194' })).v).toBe('-122.4194'); });
  it('rejected', async () => { await expect(deserialize(D, { v: '200.0' })).rejects.toThrow(BakerValidationError); });
});

describe('isEthereumAddress', () => {
  class D { @Field(isEthereumAddress) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68' })).v).toBeDefined(); });
  it('rejected', async () => { await expect(deserialize(D, { v: '0xinvalid' })).rejects.toThrow(BakerValidationError); });
});

describe('isBtcAddress', () => {
  class D { @Field(isBtcAddress) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa' })).v).toBeDefined(); });
  it('rejected', async () => { await expect(deserialize(D, { v: 'invalid' })).rejects.toThrow(BakerValidationError); });
});

describe('isISO4217CurrencyCode', () => {
  class D { @Field(isISO4217CurrencyCode) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: 'USD' })).v).toBe('USD'); });
  it('rejected', async () => { await expect(deserialize(D, { v: 'ZZZ' })).rejects.toThrow(BakerValidationError); });
});

describe('isPhoneNumber', () => {
  class D { @Field(isPhoneNumber) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: '+14155552671' })).v).toBeDefined(); });
  it('rejected', async () => { await expect(deserialize(D, { v: 'abc' })).rejects.toThrow(BakerValidationError); });
});

describe('isStrongPassword', () => {
  class D { @Field(isStrongPassword()) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: 'Str0ng!Pass' })).v).toBeDefined(); });
  it('rejected', async () => { await expect(deserialize(D, { v: 'weak' })).rejects.toThrow(BakerValidationError); });
});

describe('isFirebasePushId', () => {
  class D { @Field(isFirebasePushId) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: '-JhLeOlGIEjaIOFHR0xd' })).v).toBeDefined(); });
  it('rejected', async () => { await expect(deserialize(D, { v: 'short' })).rejects.toThrow(BakerValidationError); });
});

describe('isEAN', () => {
  class D { @Field(isEAN) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: '4006381333931' })).v).toBeDefined(); });
  it('rejected', async () => { await expect(deserialize(D, { v: '123' })).rejects.toThrow(BakerValidationError); });
});

describe('isMagnetURI', () => {
  class D { @Field(isMagnetURI) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: 'magnet:?xt=urn:btih:c12fe1c06bba254a9dc9f519b335aa7c1367a88a' })).v).toBeDefined(); });
  it('rejected', async () => { await expect(deserialize(D, { v: 'notmagnet' })).rejects.toThrow(BakerValidationError); });
});

describe('isDateString', () => {
  class D { @Field(isDateString()) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: '2024-01-01' })).v).toBe('2024-01-01'); });
  it('rejected', async () => { await expect(deserialize(D, { v: 'notdate' })).rejects.toThrow(BakerValidationError); });
});

describe('isCurrency', () => {
  class D { @Field(isCurrency()) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: '$1,000.00' })).v).toBeDefined(); });
  it('rejected', async () => { await expect(deserialize(D, { v: 'abc' })).rejects.toThrow(BakerValidationError); });
});

describe('isVariableWidth', () => {
  class D { @Field(isVariableWidth) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: '\uff41b\uff43' })).v).toBe('\uff41b\uff43'); });
  it('rejected', async () => { await expect(deserialize(D, { v: 'abc' })).rejects.toThrow(BakerValidationError); });
});

describe('isSurrogatePair', () => {
  class D { @Field(isSurrogatePair) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: '\ud842\udfb7' })).v).toBe('\ud842\udfb7'); });
  it('rejected', async () => { await expect(deserialize(D, { v: 'abc' })).rejects.toThrow(BakerValidationError); });
});

describe('isBase32', () => {
  class D { @Field(isBase32()) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: 'JBSWY3DPEHPK3PXP' })).v).toBe('JBSWY3DPEHPK3PXP'); });
  it('rejected', async () => { await expect(deserialize(D, { v: '!!invalid!!' })).rejects.toThrow(BakerValidationError); });
});

describe('isIBAN', () => {
  class D { @Field(isIBAN()) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: 'DE89370400440532013000' })).v).toBe('DE89370400440532013000'); });
  it('rejected', async () => { await expect(deserialize(D, { v: 'invalid' })).rejects.toThrow(BakerValidationError); });
});

describe('isTaxId', () => {
  class D { @Field(isTaxId('US')) v!: string; }
  it('passes', async () => { expect((await deserialize<D>(D, { v: '12-3456789' })).v).toBe('12-3456789'); });
  it('rejected', async () => { await expect(deserialize(D, { v: 'invalid' })).rejects.toThrow(BakerValidationError); });
});
