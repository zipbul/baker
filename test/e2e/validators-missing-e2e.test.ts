import { describe, it, expect, afterEach } from 'bun:test';
import { Field, deserialize, isBakerError } from '../../index';
import {
  isBase32, isBase58, isDateString, isMimeType, isCurrency, isMagnetURI,
  isHash, isRFC3339, isMilitaryTime, isLatitude, isLongitude,
  isEthereumAddress, isBtcAddress, isISO4217CurrencyCode, isPhoneNumber,
  isStrongPassword,
} from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

class Base32Dto { @Field(isBase32()) value!: string; }
class Base58Dto { @Field(isBase58) value!: string; }
class DateStringDto { @Field(isDateString()) value!: string; }
class MimeTypeDto { @Field(isMimeType) value!: string; }
class CurrencyDto { @Field(isCurrency()) value!: string; }
class MagnetURIDto { @Field(isMagnetURI) value!: string; }
class HashMd5Dto { @Field(isHash('md5')) value!: string; }
class RFC3339Dto { @Field(isRFC3339) value!: string; }
class MilitaryTimeDto { @Field(isMilitaryTime) value!: string; }
class LatitudeDto { @Field(isLatitude) value!: string; }
class LongitudeDto { @Field(isLongitude) value!: string; }
class EthereumAddressDto { @Field(isEthereumAddress) value!: string; }
class BtcAddressDto { @Field(isBtcAddress) value!: string; }
class ISO4217Dto { @Field(isISO4217CurrencyCode) value!: string; }
class PhoneNumberDto { @Field(isPhoneNumber) value!: string; }
class StrongPasswordDto { @Field(isStrongPassword()) value!: string; }

describe('isBase32', () => {
  it('valid → passes', async () => {
    const result = await deserialize(Base32Dto, { value: 'JBSWY3DPEHPK3PXP' });
    expect(isBakerError(result)).toBe(false);
  });
  it('invalid → error code isBase32', async () => {
    const result = await deserialize(Base32Dto, { value: 'not-base32!' });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors[0]!.code).toBe('isBase32');
    }
  });
});

describe('isBase58', () => {
  it('valid → passes', async () => {
    const result = await deserialize(Base58Dto, { value: '3QJmnh' });
    expect(isBakerError(result)).toBe(false);
  });
  it('invalid → error code isBase58', async () => {
    const result = await deserialize(Base58Dto, { value: '0OIl' });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors[0]!.code).toBe('isBase58');
    }
  });
});

describe('isDateString', () => {
  it('valid → passes', async () => {
    const result = await deserialize(DateStringDto, { value: '2024-01-15' });
    expect(isBakerError(result)).toBe(false);
  });
  it('invalid → error code isDateString', async () => {
    const result = await deserialize(DateStringDto, { value: 'not-a-date' });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors[0]!.code).toBe('isDateString');
    }
  });
});

describe('isMimeType', () => {
  it('valid → passes', async () => {
    const result = await deserialize(MimeTypeDto, { value: 'application/json' });
    expect(isBakerError(result)).toBe(false);
  });
  it('invalid → error code isMimeType', async () => {
    const result = await deserialize(MimeTypeDto, { value: 'notamimetype' });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors[0]!.code).toBe('isMimeType');
    }
  });
});

describe('isCurrency', () => {
  it('valid → passes', async () => {
    const result = await deserialize(CurrencyDto, { value: '$1,000.50' });
    expect(isBakerError(result)).toBe(false);
  });
  it('invalid → error code isCurrency', async () => {
    const result = await deserialize(CurrencyDto, { value: 'abc' });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors[0]!.code).toBe('isCurrency');
    }
  });
});

describe('isMagnetURI', () => {
  it('valid → passes', async () => {
    const result = await deserialize(MagnetURIDto, { value: 'magnet:?xt=urn:btih:c12fe1c06bba254a9dc9f519b335aa7c1367a88a' });
    expect(isBakerError(result)).toBe(false);
  });
  it('invalid → error code isMagnetURI', async () => {
    const result = await deserialize(MagnetURIDto, { value: 'not-magnet' });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors[0]!.code).toBe('isMagnetURI');
    }
  });
});

describe('isHash(md5)', () => {
  it('valid → passes', async () => {
    const result = await deserialize(HashMd5Dto, { value: 'd41d8cd98f00b204e9800998ecf8427e' });
    expect(isBakerError(result)).toBe(false);
  });
  it('invalid → error code isHash', async () => {
    const result = await deserialize(HashMd5Dto, { value: 'xyz' });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors[0]!.code).toBe('isHash');
    }
  });
});

describe('isRFC3339', () => {
  it('valid → passes', async () => {
    const result = await deserialize(RFC3339Dto, { value: '2024-01-15T10:30:00Z' });
    expect(isBakerError(result)).toBe(false);
  });
  it('invalid → error code isRFC3339', async () => {
    const result = await deserialize(RFC3339Dto, { value: 'not-rfc3339' });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors[0]!.code).toBe('isRFC3339');
    }
  });
});

describe('isMilitaryTime', () => {
  it('valid → passes', async () => {
    const result = await deserialize(MilitaryTimeDto, { value: '23:59' });
    expect(isBakerError(result)).toBe(false);
  });
  it('invalid → error code isMilitaryTime', async () => {
    const result = await deserialize(MilitaryTimeDto, { value: '25:00' });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors[0]!.code).toBe('isMilitaryTime');
    }
  });
});

describe('isLatitude', () => {
  it('valid → passes', async () => {
    const result = await deserialize(LatitudeDto, { value: '45.0' });
    expect(isBakerError(result)).toBe(false);
  });
  it('invalid → error code isLatitude', async () => {
    const result = await deserialize(LatitudeDto, { value: '91' });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors[0]!.code).toBe('isLatitude');
    }
  });
});

describe('isLongitude', () => {
  it('valid → passes', async () => {
    const result = await deserialize(LongitudeDto, { value: '120.5' });
    expect(isBakerError(result)).toBe(false);
  });
  it('invalid → error code isLongitude', async () => {
    const result = await deserialize(LongitudeDto, { value: '181' });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors[0]!.code).toBe('isLongitude');
    }
  });
});

describe('isEthereumAddress', () => {
  it('valid → passes', async () => {
    const result = await deserialize(EthereumAddressDto, { value: '0x0000000000000000000000000000000000000000' });
    expect(isBakerError(result)).toBe(false);
  });
  it('invalid → error code isEthereumAddress', async () => {
    const result = await deserialize(EthereumAddressDto, { value: '0xZZZ' });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors[0]!.code).toBe('isEthereumAddress');
    }
  });
});

describe('isBtcAddress', () => {
  it('valid → passes', async () => {
    const result = await deserialize(BtcAddressDto, { value: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2' });
    expect(isBakerError(result)).toBe(false);
  });
  it('invalid → error code isBtcAddress', async () => {
    const result = await deserialize(BtcAddressDto, { value: 'notabtcaddress' });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors[0]!.code).toBe('isBtcAddress');
    }
  });
});

describe('isISO4217CurrencyCode', () => {
  it('valid → passes', async () => {
    const result = await deserialize(ISO4217Dto, { value: 'USD' });
    expect(isBakerError(result)).toBe(false);
  });
  it('invalid → error code isISO4217CurrencyCode', async () => {
    const result = await deserialize(ISO4217Dto, { value: 'XXX' });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors[0]!.code).toBe('isISO4217CurrencyCode');
    }
  });
});

describe('isPhoneNumber', () => {
  it('valid → passes', async () => {
    const result = await deserialize(PhoneNumberDto, { value: '+821012345678' });
    expect(isBakerError(result)).toBe(false);
  });
  it('invalid → error code isPhoneNumber', async () => {
    const result = await deserialize(PhoneNumberDto, { value: 'not-phone' });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors[0]!.code).toBe('isPhoneNumber');
    }
  });
});

describe('isStrongPassword', () => {
  it('valid → passes', async () => {
    const result = await deserialize(StrongPasswordDto, { value: 'Str0ng!Pass' });
    expect(isBakerError(result)).toBe(false);
  });
  it('invalid → error code isStrongPassword', async () => {
    const result = await deserialize(StrongPasswordDto, { value: 'weak' });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors[0]!.code).toBe('isStrongPassword');
    }
  });
});
