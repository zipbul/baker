import { describe, it, expect, afterEach } from 'bun:test';
import {
  seal, deserialize, BakerValidationError,
  IsAscii, IsAlpha, IsAlphanumeric, IsNumberString, IsDecimal,
  IsFullWidth, IsHalfWidth, IsVariableWidth, IsMultibyte, IsSurrogatePair,
  IsHexadecimal, IsOctal,
  IsHexColor, IsRgbColor, IsHSL, IsMACAddress,
  IsISBN, IsISIN, IsISRC, IsISSN, IsJWT,
  IsLatLong, IsLocale, IsDataURI, IsFQDN, IsPort,
  IsISO31661Alpha2, IsISO31661Alpha3, IsBIC, IsSemVer, IsMongoId,
  IsBase64, IsBase58, IsBase32, IsMimeType, IsCreditCard, IsIBAN,
  IsByteLength, IsHash, IsRFC3339, IsMilitaryTime,
  IsLatitude, IsLongitude, IsEthereumAddress, IsBtcAddress,
  IsISO4217CurrencyCode, IsPhoneNumber, IsStrongPassword, IsTaxId,
  IsFirebasePushId, IsEAN, IsMagnetURI, IsDateString, IsCurrency,
} from '../../index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

describe('@IsAscii', () => {
  class D { @IsAscii() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: 'hello' })).v).toBe('hello'); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: '한글' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsAlpha', () => {
  class D { @IsAlpha() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: 'abc' })).v).toBe('abc'); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: 'abc123' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsAlphanumeric', () => {
  class D { @IsAlphanumeric() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: 'abc123' })).v).toBe('abc123'); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: 'abc-123' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsNumberString', () => {
  class D { @IsNumberString() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: '123.45' })).v).toBe('123.45'); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: 'abc' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsDecimal', () => {
  class D { @IsDecimal() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: '3.14' })).v).toBe('3.14'); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: 'abc' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsFullWidth', () => {
  class D { @IsFullWidth() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: 'ａｂｃ' })).v).toBe('ａｂｃ'); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: 'abc' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsHalfWidth', () => {
  class D { @IsHalfWidth() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: 'abc' })).v).toBe('abc'); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: 'ａｂｃ' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsMultibyte', () => {
  class D { @IsMultibyte() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: '한글テスト' })).v).toBe('한글テスト'); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: 'abc' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsHexadecimal', () => {
  class D { @IsHexadecimal() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: 'deadBEEF' })).v).toBe('deadBEEF'); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: 'xyz' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsOctal', () => {
  class D { @IsOctal() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: '0o777' })).v).toBe('0o777'); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: '999' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsHexColor', () => {
  class D { @IsHexColor() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: '#ff0000' })).v).toBe('#ff0000'); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: 'red' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsRgbColor', () => {
  class D { @IsRgbColor() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: 'rgb(255,0,0)' })).v).toBe('rgb(255,0,0)'); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: 'red' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsHSL', () => {
  class D { @IsHSL() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: 'hsl(0,100%,50%)' })).v).toBe('hsl(0,100%,50%)'); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: 'red' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsMACAddress', () => {
  class D { @IsMACAddress() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: 'AA:BB:CC:DD:EE:FF' })).v).toBe('AA:BB:CC:DD:EE:FF'); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: 'invalid' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsISBN', () => {
  class D { @IsISBN(13) v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: '9780306406157' })).v).toBe('9780306406157'); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: '123' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsISIN', () => {
  class D { @IsISIN() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: 'US0378331005' })).v).toBe('US0378331005'); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: 'invalid' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsISRC', () => {
  class D { @IsISRC() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: 'USRC17607839' })).v).toBe('USRC17607839'); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: 'invalid' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsISSN', () => {
  class D { @IsISSN() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: '0378-5955' })).v).toBe('0378-5955'); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: '1234' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsJWT', () => {
  class D { @IsJWT() v!: string; }
  const validJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: validJwt })).v).toBe(validJwt); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: 'hello' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsLatLong', () => {
  class D { @IsLatLong() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: '37.7749,-122.4194' })).v).toBe('37.7749,-122.4194'); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: 'invalid' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsLocale', () => {
  class D { @IsLocale() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: 'en-US' })).v).toBe('en-US'); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: '!!!' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsDataURI', () => {
  class D { @IsDataURI() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: 'data:text/plain;base64,SGVsbG8=' })).v).toContain('data:'); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: 'not-data-uri' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsFQDN', () => {
  class D { @IsFQDN() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: 'example.com' })).v).toBe('example.com'); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: 'not_a_domain' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsPort', () => {
  class D { @IsPort() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: '8080' })).v).toBe('8080'); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: '99999' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsISO31661Alpha2', () => {
  class D { @IsISO31661Alpha2() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: 'US' })).v).toBe('US'); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: 'ZZ' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsISO31661Alpha3', () => {
  class D { @IsISO31661Alpha3() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: 'USA' })).v).toBe('USA'); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: 'ZZZ' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsBIC', () => {
  class D { @IsBIC() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: 'DEUTDEFF' })).v).toBe('DEUTDEFF'); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: 'invalid' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsSemVer', () => {
  class D { @IsSemVer() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: '1.2.3' })).v).toBe('1.2.3'); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: 'abc' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsMongoId', () => {
  class D { @IsMongoId() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: '507f1f77bcf86cd799439011' })).v).toBe('507f1f77bcf86cd799439011'); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: 'short' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsBase64', () => {
  class D { @IsBase64() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: 'SGVsbG8=' })).v).toBe('SGVsbG8='); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: '!!!' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsBase58', () => {
  class D { @IsBase58() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: '3J98t1WpEZ' })).v).toBe('3J98t1WpEZ'); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: '0OIl' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsMimeType', () => {
  class D { @IsMimeType() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: 'application/json' })).v).toBe('application/json'); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: 'not-mime' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsCreditCard', () => {
  class D { @IsCreditCard() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: '4111111111111111' })).v).toBe('4111111111111111'); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: '1234' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsByteLength', () => {
  class D { @IsByteLength(1, 10) v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: 'hello' })).v).toBe('hello'); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: '' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsHash', () => {
  class D { @IsHash('md5') v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: 'd41d8cd98f00b204e9800998ecf8427e' })).v).toBeDefined(); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: 'nothash' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsRFC3339', () => {
  class D { @IsRFC3339() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: '2024-01-01T00:00:00Z' })).v).toBeDefined(); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: 'not-date' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsMilitaryTime', () => {
  class D { @IsMilitaryTime() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: '23:59' })).v).toBe('23:59'); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: '25:00' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsLatitude', () => {
  class D { @IsLatitude() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: '37.7749' })).v).toBe('37.7749'); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: '100.0' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsLongitude', () => {
  class D { @IsLongitude() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: '-122.4194' })).v).toBe('-122.4194'); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: '200.0' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsEthereumAddress', () => {
  class D { @IsEthereumAddress() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68' })).v).toBeDefined(); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: '0xinvalid' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsBtcAddress', () => {
  class D { @IsBtcAddress() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa' })).v).toBeDefined(); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: 'invalid' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsISO4217CurrencyCode', () => {
  class D { @IsISO4217CurrencyCode() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: 'USD' })).v).toBe('USD'); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: 'ZZZ' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsPhoneNumber', () => {
  class D { @IsPhoneNumber() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: '+14155552671' })).v).toBeDefined(); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: 'abc' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsStrongPassword', () => {
  class D { @IsStrongPassword() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: 'Str0ng!Pass' })).v).toBeDefined(); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: 'weak' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsFirebasePushId', () => {
  class D { @IsFirebasePushId() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: '-JhLeOlGIEjaIOFHR0xd' })).v).toBeDefined(); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: 'short' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsEAN', () => {
  class D { @IsEAN() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: '4006381333931' })).v).toBeDefined(); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: '123' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsMagnetURI', () => {
  class D { @IsMagnetURI() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: 'magnet:?xt=urn:btih:c12fe1c06bba254a9dc9f519b335aa7c1367a88a' })).v).toBeDefined(); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: 'notmagnet' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsDateString', () => {
  class D { @IsDateString() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: '2024-01-01' })).v).toBe('2024-01-01'); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: 'notdate' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsCurrency', () => {
  class D { @IsCurrency() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: '$1,000.00' })).v).toBeDefined(); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: 'abc' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsVariableWidth', () => {
  class D { @IsVariableWidth() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: 'ａbｃ' })).v).toBe('ａbｃ'); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: 'abc' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsSurrogatePair', () => {
  class D { @IsSurrogatePair() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: '𠮷' })).v).toBe('𠮷'); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: 'abc' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsBase32', () => {
  class D { @IsBase32() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: 'JBSWY3DPEHPK3PXP' })).v).toBe('JBSWY3DPEHPK3PXP'); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: '!!invalid!!' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsIBAN', () => {
  class D { @IsIBAN() v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: 'DE89370400440532013000' })).v).toBe('DE89370400440532013000'); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: 'invalid' })).rejects.toThrow(BakerValidationError); });
});

describe('@IsTaxId', () => {
  class D { @IsTaxId('US') v!: string; }
  it('통과', async () => { seal(); expect((await deserialize<D>(D, { v: '12-3456789' })).v).toBe('12-3456789'); });
  it('거부', async () => { seal(); await expect(deserialize(D, { v: 'invalid' })).rejects.toThrow(BakerValidationError); });
});
