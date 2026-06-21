import { describe, it, expect, beforeEach } from 'bun:test';

import { Baker, isBakerIssueSet, Field } from '../../index';
import {
  isAscii,
  isAlpha,
  isAlphanumeric,
  isNumberString,
  isDecimal,
  isFullWidth,
  isHalfWidth,
  isVariableWidth,
  isMultibyte,
  isSurrogatePair,
  isHexadecimal,
  isOctal,
  isHexColor,
  isRgbColor,
  isHSL,
  isMACAddress,
  isISBN,
  isISIN,
  isISRC,
  isISSN,
  isJWT,
  isLatLong,
  isLocale,
  isDataURI,
  isFQDN,
  isPort,
  isISO31661Alpha2,
  isISO31661Alpha3,
  isBIC,
  isSemVer,
  isMongoId,
  isBase64,
  isBase58,
  isBase32,
  isMimeType,
  isCreditCard,
  isIBAN,
  isByteLength,
  isHash,
  isRFC3339,
  isMilitaryTime,
  isLatitude,
  isLongitude,
  isEthereumAddress,
  isBtcAddress,
  isISO4217CurrencyCode,
  isPhoneNumber,
  isStrongPassword,
  isTaxId,
  isFirebasePushId,
  isEAN,
  isMagnetURI,
  isDateString,
  isCurrency,
  isHttpToken,
  isOrigin,
  isCorsOrigin,
} from '../../src/rules/index';

const baker = new Baker();

beforeEach(() => baker.seal());
// ─────────────────────────────────────────────────────────────────────────────

describe('isAscii', () => {
  @baker.Recipe
  class D {
    @Field(isAscii) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: 'hello' })) as D).v).toBe('hello');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: '한글' }))).toBe(true);
  });
});

describe('isHttpToken', () => {
  @baker.Recipe
  class D {
    @Field(isHttpToken) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: 'X-Foo' })) as D).v).toBe('X-Foo');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'X-Foo(bar)' }))).toBe(true);
  });
  it('rejects empty string (1*tchar)', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: '' }))).toBe(true);
  });
});

describe('isOrigin', () => {
  @baker.Recipe
  class D {
    @Field(isOrigin) v!: string;
  }
  it('passes for a canonical serialized origin', async () => {
    expect(((await baker.deserialize(D, { v: 'https://a.com' })) as D).v).toBe('https://a.com');
  });
  it('passes for the opaque "null" literal', async () => {
    expect(((await baker.deserialize(D, { v: 'null' })) as D).v).toBe('null');
  });
  it('rejects trailing slash', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'https://a.com/' }))).toBe(true);
  });
  it('rejects explicit default port', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'https://a.com:443' }))).toBe(true);
  });
  it('rejects the CORS wildcard (general rule)', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: '*' }))).toBe(true);
  });
});

describe('isCorsOrigin', () => {
  @baker.Recipe
  class D {
    @Field(isCorsOrigin) v!: string;
  }
  it('passes for a canonical serialized origin', async () => {
    expect(((await baker.deserialize(D, { v: 'https://a.com' })) as D).v).toBe('https://a.com');
  });
  it('passes for the "*" wildcard', async () => {
    expect(((await baker.deserialize(D, { v: '*' })) as D).v).toBe('*');
  });
  it('rejects uppercase scheme/host', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'HTTPS://A.COM' }))).toBe(true);
  });
});

describe('isAlpha', () => {
  @baker.Recipe
  class D {
    @Field(isAlpha) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: 'abc' })) as D).v).toBe('abc');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'abc123' }))).toBe(true);
  });
});

describe('isAlphanumeric', () => {
  @baker.Recipe
  class D {
    @Field(isAlphanumeric) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: 'abc123' })) as D).v).toBe('abc123');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'abc-123' }))).toBe(true);
  });
});

describe('isNumberString', () => {
  @baker.Recipe
  class D {
    @Field(isNumberString()) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: '123.45' })) as D).v).toBe('123.45');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'abc' }))).toBe(true);
  });
});

describe('isNumberString({ noSymbols: true })', () => {
  @baker.Recipe
  class NumStrictDto {
    @Field(isNumberString({ noSymbols: true })) v!: string;
  }
  it('pure digits passes', async () => {
    expect(((await baker.deserialize<NumStrictDto>(NumStrictDto, { v: '12345' })) as NumStrictDto).v).toBe('12345');
  });
  it('digits with decimal point rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(NumStrictDto, { v: '1.5' }))).toBe(true);
  });
  it('empty string rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(NumStrictDto, { v: '' }))).toBe(true);
  });
  it('digits with sign rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(NumStrictDto, { v: '-1' }))).toBe(true);
  });
});

describe('isDecimal', () => {
  @baker.Recipe
  class D {
    @Field(isDecimal()) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: '3.14' })) as D).v).toBe('3.14');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'abc' }))).toBe(true);
  });
});

describe('isFullWidth', () => {
  @baker.Recipe
  class D {
    @Field(isFullWidth) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: '\uff41\uff42\uff43' })) as D).v).toBe('\uff41\uff42\uff43');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'abc' }))).toBe(true);
  });
});

describe('isHalfWidth', () => {
  @baker.Recipe
  class D {
    @Field(isHalfWidth) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: 'abc' })) as D).v).toBe('abc');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: '\uff41\uff42\uff43' }))).toBe(true);
  });
});

describe('isMultibyte', () => {
  @baker.Recipe
  class D {
    @Field(isMultibyte) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: '\ud55c\uae00\u30c6\u30b9\u30c8' })) as D).v).toBe('\ud55c\uae00\u30c6\u30b9\u30c8');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'abc' }))).toBe(true);
  });
});

describe('isHexadecimal', () => {
  @baker.Recipe
  class D {
    @Field(isHexadecimal) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: 'deadBEEF' })) as D).v).toBe('deadBEEF');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'xyz' }))).toBe(true);
  });
});

describe('isOctal', () => {
  @baker.Recipe
  class D {
    @Field(isOctal) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: '0o777' })) as D).v).toBe('0o777');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: '999' }))).toBe(true);
  });
});

describe('isHexColor', () => {
  @baker.Recipe
  class D {
    @Field(isHexColor) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: '#ff0000' })) as D).v).toBe('#ff0000');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'red' }))).toBe(true);
  });
});

describe('isRgbColor', () => {
  @baker.Recipe
  class D {
    @Field(isRgbColor()) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: 'rgb(255,0,0)' })) as D).v).toBe('rgb(255,0,0)');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'red' }))).toBe(true);
  });
});

describe('isHSL', () => {
  @baker.Recipe
  class D {
    @Field(isHSL) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: 'hsl(0,100%,50%)' })) as D).v).toBe('hsl(0,100%,50%)');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'red' }))).toBe(true);
  });
});

describe('isMACAddress', () => {
  @baker.Recipe
  class D {
    @Field(isMACAddress()) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: 'AA:BB:CC:DD:EE:FF' })) as D).v).toBe('AA:BB:CC:DD:EE:FF');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'invalid' }))).toBe(true);
  });
});

describe('isISBN', () => {
  @baker.Recipe
  class D {
    @Field(isISBN(13)) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: '9780306406157' })) as D).v).toBe('9780306406157');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: '123' }))).toBe(true);
  });
});

describe('isISIN', () => {
  @baker.Recipe
  class D {
    @Field(isISIN) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: 'US0378331005' })) as D).v).toBe('US0378331005');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'invalid' }))).toBe(true);
  });
});

describe('isISRC', () => {
  @baker.Recipe
  class D {
    @Field(isISRC) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: 'USRC17607839' })) as D).v).toBe('USRC17607839');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'invalid' }))).toBe(true);
  });
});

describe('isISSN', () => {
  @baker.Recipe
  class D {
    @Field(isISSN()) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: '0378-5955' })) as D).v).toBe('0378-5955');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: '1234' }))).toBe(true);
  });
});

describe('isJWT', () => {
  @baker.Recipe
  class D {
    @Field(isJWT) v!: string;
  }
  const validJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: validJwt })) as D).v).toBe(validJwt);
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'hello' }))).toBe(true);
  });
});

describe('isLatLong', () => {
  @baker.Recipe
  class D {
    @Field(isLatLong()) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: '37.7749,-122.4194' })) as D).v).toBe('37.7749,-122.4194');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'invalid' }))).toBe(true);
  });
});

describe('isLocale', () => {
  @baker.Recipe
  class D {
    @Field(isLocale) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: 'en-US' })) as D).v).toBe('en-US');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: '!!!' }))).toBe(true);
  });
});

describe('isDataURI', () => {
  @baker.Recipe
  class D {
    @Field(isDataURI) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: 'data:text/plain;base64,SGVsbG8=' })) as D).v).toContain('data:');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'not-data-uri' }))).toBe(true);
  });
});

describe('isFQDN', () => {
  @baker.Recipe
  class D {
    @Field(isFQDN()) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: 'example.com' })) as D).v).toBe('example.com');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'not_a_domain' }))).toBe(true);
  });
});

describe('isFQDN({ requireTld: false })', () => {
  @baker.Recipe
  class HostDto {
    @Field(isFQDN({ requireTld: false })) host!: string;
  }
  it('single-label hostname passes', async () => {
    const r = (await baker.deserialize<HostDto>(HostDto, { host: 'localhost' })) as HostDto;
    expect(r.host).toBe('localhost');
  });
  it('empty string rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(HostDto, { host: '' }))).toBe(true);
  });
});

describe('isPort', () => {
  @baker.Recipe
  class D {
    @Field(isPort) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: '8080' })) as D).v).toBe('8080');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: '99999' }))).toBe(true);
  });
});

describe('isISO31661Alpha2', () => {
  @baker.Recipe
  class D {
    @Field(isISO31661Alpha2) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: 'US' })) as D).v).toBe('US');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'ZZ' }))).toBe(true);
  });
});

describe('isISO31661Alpha3', () => {
  @baker.Recipe
  class D {
    @Field(isISO31661Alpha3) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: 'USA' })) as D).v).toBe('USA');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'ZZZ' }))).toBe(true);
  });
});

describe('isBIC', () => {
  @baker.Recipe
  class D {
    @Field(isBIC) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: 'DEUTDEFF' })) as D).v).toBe('DEUTDEFF');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'invalid' }))).toBe(true);
  });
});

describe('isSemVer', () => {
  @baker.Recipe
  class D {
    @Field(isSemVer) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: '1.2.3' })) as D).v).toBe('1.2.3');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'abc' }))).toBe(true);
  });
});

describe('isMongoId', () => {
  @baker.Recipe
  class D {
    @Field(isMongoId) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: '507f1f77bcf86cd799439011' })) as D).v).toBe('507f1f77bcf86cd799439011');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'short' }))).toBe(true);
  });
});

describe('isBase64', () => {
  @baker.Recipe
  class D {
    @Field(isBase64()) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: 'SGVsbG8=' })) as D).v).toBe('SGVsbG8=');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: '!!!' }))).toBe(true);
  });
});

describe('isBase58', () => {
  @baker.Recipe
  class D {
    @Field(isBase58) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: '3J98t1WpEZ' })) as D).v).toBe('3J98t1WpEZ');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: '0OIl' }))).toBe(true);
  });
});

describe('isMimeType', () => {
  @baker.Recipe
  class D {
    @Field(isMimeType) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: 'application/json' })) as D).v).toBe('application/json');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'not-mime' }))).toBe(true);
  });
});

describe('isCreditCard', () => {
  @baker.Recipe
  class D {
    @Field(isCreditCard) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: '4111111111111111' })) as D).v).toBe('4111111111111111');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: '1234' }))).toBe(true);
  });
});

describe('isByteLength', () => {
  @baker.Recipe
  class D {
    @Field(isByteLength(1, 10)) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: 'hello' })) as D).v).toBe('hello');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: '' }))).toBe(true);
  });
});

describe('isHash', () => {
  @baker.Recipe
  class D {
    @Field(isHash('md5')) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: 'd41d8cd98f00b204e9800998ecf8427e' })) as D).v).toBe('d41d8cd98f00b204e9800998ecf8427e');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'nothash' }))).toBe(true);
  });
});

describe('isRFC3339', () => {
  @baker.Recipe
  class D {
    @Field(isRFC3339) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: '2024-01-01T00:00:00Z' })) as D).v).toBe('2024-01-01T00:00:00Z');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'not-date' }))).toBe(true);
  });
});

describe('isMilitaryTime', () => {
  @baker.Recipe
  class D {
    @Field(isMilitaryTime) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: '23:59' })) as D).v).toBe('23:59');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: '25:00' }))).toBe(true);
  });
});

describe('isLatitude', () => {
  @baker.Recipe
  class D {
    @Field(isLatitude) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: '37.7749' })) as D).v).toBe('37.7749');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: '100.0' }))).toBe(true);
  });
});

describe('isLongitude', () => {
  @baker.Recipe
  class D {
    @Field(isLongitude) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: '-122.4194' })) as D).v).toBe('-122.4194');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: '200.0' }))).toBe(true);
  });
});

describe('isEthereumAddress', () => {
  @baker.Recipe
  class D {
    @Field(isEthereumAddress) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68' })) as D).v).toBe(
      '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68',
    );
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: '0xinvalid' }))).toBe(true);
  });
});

describe('isBtcAddress', () => {
  @baker.Recipe
  class D {
    @Field(isBtcAddress) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa' })) as D).v).toBe(
      '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
    );
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'invalid' }))).toBe(true);
  });
});

describe('isISO4217CurrencyCode', () => {
  @baker.Recipe
  class D {
    @Field(isISO4217CurrencyCode) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: 'USD' })) as D).v).toBe('USD');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'ZZZ' }))).toBe(true);
  });
});

describe('isPhoneNumber', () => {
  @baker.Recipe
  class D {
    @Field(isPhoneNumber) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: '+14155552671' })) as D).v).toBe('+14155552671');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'abc' }))).toBe(true);
  });
});

describe('isStrongPassword', () => {
  @baker.Recipe
  class D {
    @Field(isStrongPassword()) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: 'Str0ng!Pass' })) as D).v).toBe('Str0ng!Pass');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'weak' }))).toBe(true);
  });
});

describe('isFirebasePushId', () => {
  @baker.Recipe
  class D {
    @Field(isFirebasePushId) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: '-JhLeOlGIEjaIOFHR0xd' })) as D).v).toBe('-JhLeOlGIEjaIOFHR0xd');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'short' }))).toBe(true);
  });
});

describe('isEAN', () => {
  @baker.Recipe
  class D {
    @Field(isEAN) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: '4006381333931' })) as D).v).toBe('4006381333931');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: '123' }))).toBe(true);
  });
});

describe('isMagnetURI', () => {
  @baker.Recipe
  class D {
    @Field(isMagnetURI) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: 'magnet:?xt=urn:btih:c12fe1c06bba254a9dc9f519b335aa7c1367a88a' })) as D).v).toBe(
      'magnet:?xt=urn:btih:c12fe1c06bba254a9dc9f519b335aa7c1367a88a',
    );
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'notmagnet' }))).toBe(true);
  });
});

describe('isDateString', () => {
  @baker.Recipe
  class D {
    @Field(isDateString()) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: '2024-01-01' })) as D).v).toBe('2024-01-01');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'notdate' }))).toBe(true);
  });
  // Generated-code path must use the proleptic Gregorian leap rule for years 0–99 too (year 0 is leap).
  it('accepts 0000-02-29 (year 0 is a leap year)', async () => {
    expect(((await baker.deserialize(D, { v: '0000-02-29' })) as D).v).toBe('0000-02-29');
  });
  it('rejects 0001-02-29 (year 1 is not a leap year)', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: '0001-02-29' }))).toBe(true);
  });
  it('rejects 1900-02-29 (divisible by 100, not 400)', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: '1900-02-29' }))).toBe(true);
  });
});

describe('isCurrency', () => {
  @baker.Recipe
  class D {
    @Field(isCurrency()) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: '$1,000.00' })) as D).v).toBe('$1,000.00');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'abc' }))).toBe(true);
  });
});

describe('isVariableWidth', () => {
  @baker.Recipe
  class D {
    @Field(isVariableWidth) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: '\uff41b\uff43' })) as D).v).toBe('\uff41b\uff43');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'abc' }))).toBe(true);
  });
});

describe('isSurrogatePair', () => {
  @baker.Recipe
  class D {
    @Field(isSurrogatePair) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: '\ud842\udfb7' })) as D).v).toBe('\ud842\udfb7');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'abc' }))).toBe(true);
  });
});

describe('isBase32', () => {
  @baker.Recipe
  class D {
    @Field(isBase32()) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: 'JBSWY3DPEHPK3PXP' })) as D).v).toBe('JBSWY3DPEHPK3PXP');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: '!!invalid!!' }))).toBe(true);
  });
});

describe('isIBAN', () => {
  @baker.Recipe
  class D {
    @Field(isIBAN()) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: 'DE89370400440532013000' })) as D).v).toBe('DE89370400440532013000');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'invalid' }))).toBe(true);
  });
});

describe('isTaxId', () => {
  @baker.Recipe
  class D {
    @Field(isTaxId('US')) v!: string;
  }
  it('passes', async () => {
    expect(((await baker.deserialize(D, { v: '12-3456789' })) as D).v).toBe('12-3456789');
  });
  it('rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(D, { v: 'invalid' }))).toBe(true);
  });
});
