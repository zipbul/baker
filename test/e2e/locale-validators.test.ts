import { describe, it, expect } from 'bun:test';
import { deserialize, BakerValidationError, Field } from '../../index';
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
    const r = await deserialize<PhoneKRDto>(PhoneKRDto, { phone: '01012345678' });
    expect(r.phone).toBe('01012345678');
  });

  it('ko-KR invalid number rejected', async () => {
    await expect(
      deserialize(PhoneKRDto, { phone: '1234' }),
    ).rejects.toThrow(BakerValidationError);
  });

  it('en-US valid number passes', async () => {
    const r = await deserialize<PhoneUSDto>(PhoneUSDto, { phone: '2125551234' });
    expect(r.phone).toBe('2125551234');
  });

  it('en-US invalid number rejected', async () => {
    await expect(
      deserialize(PhoneUSDto, { phone: 'abc' }),
    ).rejects.toThrow(BakerValidationError);
  });
});

describe('isPostalCode', () => {
  it('US postal code passes', async () => {
    const r = await deserialize<PostalUSDto>(PostalUSDto, { code: '10001' });
    expect(r.code).toBe('10001');
  });

  it('US invalid postal code rejected', async () => {
    await expect(
      deserialize(PostalUSDto, { code: '1234' }),
    ).rejects.toThrow(BakerValidationError);
  });

  it('KR postal code passes', async () => {
    const r = await deserialize<PostalKRDto>(PostalKRDto, { code: '06164' });
    expect(r.code).toBe('06164');
  });
});

describe('isIdentityCard', () => {
  it('US SSN format passes', async () => {
    const r = await deserialize<IdentityUSDto>(IdentityUSDto, { ssn: '123-45-6789' });
    expect(r.ssn).toBe('123-45-6789');
  });

  it('invalid format rejected', async () => {
    await expect(
      deserialize(IdentityUSDto, { ssn: '12345' }),
    ).rejects.toThrow(BakerValidationError);
  });
});

describe('isPassportNumber', () => {
  it('US passport number passes', async () => {
    const r = await deserialize<PassportUSDto>(PassportUSDto, { passport: '123456789' });
    expect(r.passport).toBe('123456789');
  });

  it('invalid format rejected', async () => {
    await expect(
      deserialize(PassportUSDto, { passport: 'AB123' }),
    ).rejects.toThrow(BakerValidationError);
  });
});
