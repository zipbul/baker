import { describe, it, expect } from 'bun:test';
import { deserialize, isBakerError, Field } from '../../index';
import { isMobilePhone, isPostalCode, isIdentityCard, isPassportNumber } from '../../src/rules/index';
// ─────────────────────────────────────────────────────────────────────────────

class PhoneKRDto { @Field(isMobilePhone('ko-KR')) phone!: string; }
class PhoneUSDto { @Field(isMobilePhone('en-US')) phone!: string; }
class PostalUSDto { @Field(isPostalCode('US')) code!: string; }
class PostalKRDto { @Field(isPostalCode('KR')) code!: string; }
class IdentityUSDto { @Field(isIdentityCard('US')) ssn!: string; }
class PassportUSDto { @Field(isPassportNumber('US')) passport!: string; }

// ─────────────────────────────────────────────────────────────────────────────

describe('isMobilePhone', () => {
  it('ko-KR valid number passes', async () => {
    const r = await deserialize(PhoneKRDto, { phone: '01012345678' }) as PhoneKRDto;
    expect(r.phone).toBe('01012345678');
  });

  it('ko-KR invalid number rejected', async () => {
    expect(isBakerError(await deserialize(PhoneKRDto, { phone: '1234' }))).toBe(true);
  });

  it('en-US valid number passes', async () => {
    const r = await deserialize(PhoneUSDto, { phone: '2125551234' }) as PhoneUSDto;
    expect(r.phone).toBe('2125551234');
  });

  it('en-US invalid number rejected', async () => {
    expect(isBakerError(await deserialize(PhoneUSDto, { phone: 'abc' }))).toBe(true);
  });
});

describe('isPostalCode', () => {
  it('US postal code passes', async () => {
    const r = await deserialize(PostalUSDto, { code: '10001' }) as PostalUSDto;
    expect(r.code).toBe('10001');
  });

  it('US invalid postal code rejected', async () => {
    expect(isBakerError(await deserialize(PostalUSDto, { code: '1234' }))).toBe(true);
  });

  it('KR postal code passes', async () => {
    const r = await deserialize(PostalKRDto, { code: '06164' }) as PostalKRDto;
    expect(r.code).toBe('06164');
  });
});

describe('isIdentityCard', () => {
  it('US SSN format passes', async () => {
    const r = await deserialize(IdentityUSDto, { ssn: '123-45-6789' }) as IdentityUSDto;
    expect(r.ssn).toBe('123-45-6789');
  });

  it('invalid format rejected', async () => {
    expect(isBakerError(await deserialize(IdentityUSDto, { ssn: '12345' }))).toBe(true);
  });
});

describe('isPassportNumber', () => {
  it('US passport number passes', async () => {
    const r = await deserialize(PassportUSDto, { passport: '123456789' }) as PassportUSDto;
    expect(r.passport).toBe('123456789');
  });

  it('invalid format rejected', async () => {
    expect(isBakerError(await deserialize(PassportUSDto, { passport: 'AB123' }))).toBe(true);
  });
});
