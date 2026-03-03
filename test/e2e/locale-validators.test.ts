import { describe, it, expect, afterEach } from 'bun:test';
import {
  seal, deserialize, BakerValidationError,
  IsMobilePhone, IsPostalCode, IsIdentityCard, IsPassportNumber,
} from '../../index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class PhoneKRDto { @IsMobilePhone('ko-KR') phone!: string; }
class PhoneUSDto { @IsMobilePhone('en-US') phone!: string; }
class PostalUSDto { @IsPostalCode('US') code!: string; }
class PostalKRDto { @IsPostalCode('KR') code!: string; }
class IdentityUSDto { @IsIdentityCard('US') ssn!: string; }
class PassportUSDto { @IsPassportNumber('US') passport!: string; }

// ─────────────────────────────────────────────────────────────────────────────

describe('@IsMobilePhone', () => {
  it('ko-KR 유효 번호 통과', async () => {
    seal();
    const r = await deserialize<PhoneKRDto>(PhoneKRDto, { phone: '01012345678' });
    expect(r.phone).toBe('01012345678');
  });

  it('ko-KR 잘못된 번호 거부', async () => {
    seal();
    await expect(
      deserialize(PhoneKRDto, { phone: '1234' }),
    ).rejects.toThrow(BakerValidationError);
  });

  it('en-US 유효 번호 통과', async () => {
    seal();
    const r = await deserialize<PhoneUSDto>(PhoneUSDto, { phone: '2125551234' });
    expect(r.phone).toBe('2125551234');
  });

  it('en-US 잘못된 번호 거부', async () => {
    seal();
    await expect(
      deserialize(PhoneUSDto, { phone: 'abc' }),
    ).rejects.toThrow(BakerValidationError);
  });
});

describe('@IsPostalCode', () => {
  it('US 우편번호 통과', async () => {
    seal();
    const r = await deserialize<PostalUSDto>(PostalUSDto, { code: '10001' });
    expect(r.code).toBe('10001');
  });

  it('US 잘못된 우편번호 거부', async () => {
    seal();
    await expect(
      deserialize(PostalUSDto, { code: '1234' }),
    ).rejects.toThrow(BakerValidationError);
  });

  it('KR 우편번호 통과', async () => {
    seal();
    const r = await deserialize<PostalKRDto>(PostalKRDto, { code: '06164' });
    expect(r.code).toBe('06164');
  });
});

describe('@IsIdentityCard', () => {
  it('US SSN 형식 통과', async () => {
    seal();
    const r = await deserialize<IdentityUSDto>(IdentityUSDto, { ssn: '123-45-6789' });
    expect(r.ssn).toBe('123-45-6789');
  });

  it('잘못된 형식 거부', async () => {
    seal();
    await expect(
      deserialize(IdentityUSDto, { ssn: '12345' }),
    ).rejects.toThrow(BakerValidationError);
  });
});

describe('@IsPassportNumber', () => {
  it('US 여권번호 통과', async () => {
    seal();
    const r = await deserialize<PassportUSDto>(PassportUSDto, { passport: '123456789' });
    expect(r.passport).toBe('123456789');
  });

  it('잘못된 형식 거부', async () => {
    seal();
    await expect(
      deserialize(PassportUSDto, { passport: 'AB123' }),
    ).rejects.toThrow(BakerValidationError);
  });
});
