import { describe, it, expect } from 'bun:test';
import { deserialize, BakerValidationError, Field } from '../../index';
import {
  isString, isEmail, isUUID, isIP, isURL, isISO8601,
  minLength, maxLength, matches, contains, length,
} from '../../src/rules/index';
// ─────────────────────────────────────────────────────────────────────────────

class EmailDto { @Field(isEmail()) email!: string; }
class UUIDDto { @Field(isUUID()) id!: string; }
class IPv4Dto { @Field(isIP(4)) ip!: string; }
class IPv6Dto { @Field(isIP(6)) ip!: string; }
class URLDto { @Field(isURL()) url!: string; }
class ISO8601Dto { @Field(isISO8601()) ts!: string; }

class MinLenDto {
  @Field(isString, minLength(3)) name!: string;
}
class MaxLenDto {
  @Field(isString, maxLength(5)) code!: string;
}
class LengthDto {
  @Field(isString, length(2, 10)) tag!: string;
}
class MatchesDto {
  @Field(isString, matches(/^[a-z]+$/)) slug!: string;
}
class ContainsDto {
  @Field(isString, contains('hello')) greeting!: string;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('isEmail', () => {
  it('유효한 이메일 통과', async () => {
    const r = await deserialize<EmailDto>(EmailDto, { email: 'test@example.com' });
    expect(r.email).toBe('test@example.com');
  });
  it('잘못된 이메일 거부', async () => {
    await expect(deserialize(EmailDto, { email: 'not-email' })).rejects.toThrow(BakerValidationError);
  });
});

describe('isUUID', () => {
  it('유효한 UUID v4 통과', async () => {
    const r = await deserialize<UUIDDto>(UUIDDto, { id: '550e8400-e29b-41d4-a716-446655440000' });
    expect(r.id).toBe('550e8400-e29b-41d4-a716-446655440000');
  });
  it('잘못된 UUID 거부', async () => {
    await expect(deserialize(UUIDDto, { id: 'not-uuid' })).rejects.toThrow(BakerValidationError);
  });
});

describe('isIP', () => {
  it('IPv4 통과', async () => {
    const r = await deserialize<IPv4Dto>(IPv4Dto, { ip: '192.168.1.1' });
    expect(r.ip).toBe('192.168.1.1');
  });
  it('IPv6 통과', async () => {
    const r = await deserialize<IPv6Dto>(IPv6Dto, { ip: '::1' });
    expect(r.ip).toBe('::1');
  });
  it('IPv4에 IPv6 값 거부', async () => {
    await expect(deserialize(IPv4Dto, { ip: '::1' })).rejects.toThrow(BakerValidationError);
  });
  it('잘못된 IP 거부', async () => {
    await expect(deserialize(IPv4Dto, { ip: 'not-ip' })).rejects.toThrow(BakerValidationError);
  });
});

describe('isURL', () => {
  it('유효한 URL 통과', async () => {
    const r = await deserialize<URLDto>(URLDto, { url: 'https://example.com' });
    expect(r.url).toBe('https://example.com');
  });
  it('잘못된 URL 거부', async () => {
    await expect(deserialize(URLDto, { url: 'not a url' })).rejects.toThrow(BakerValidationError);
  });

  // E-6: isURL port boundary (→ C-6)
  it('포트 65535 통과', async () => {
    const r = await deserialize<URLDto>(URLDto, { url: 'https://example.com:65535' });
    expect(r.url).toBe('https://example.com:65535');
  });
  it('포트 65536 거부', async () => {
    await expect(deserialize(URLDto, { url: 'https://example.com:65536' })).rejects.toThrow(BakerValidationError);
  });
  it('포트 99999 거부', async () => {
    await expect(deserialize(URLDto, { url: 'https://example.com:99999' })).rejects.toThrow(BakerValidationError);
  });
  it('포트 0 통과', async () => {
    const r = await deserialize<URLDto>(URLDto, { url: 'https://example.com:0' });
    expect(r.url).toBe('https://example.com:0');
  });
});

describe('isISO8601', () => {
  it('유효한 ISO8601 통과', async () => {
    const r = await deserialize<ISO8601Dto>(ISO8601Dto, { ts: '2024-01-01T00:00:00.000Z' });
    expect(r.ts).toBe('2024-01-01T00:00:00.000Z');
  });
  it('잘못된 날짜 문자열 거부', async () => {
    await expect(deserialize(ISO8601Dto, { ts: 'not-a-date' })).rejects.toThrow(BakerValidationError);
  });
});

describe('minLength / maxLength', () => {
  it('MinLength 통과', async () => {
    const r = await deserialize<MinLenDto>(MinLenDto, { name: 'abc' });
    expect(r.name).toBe('abc');
  });
  it('MinLength 미달 거부', async () => {
    await expect(deserialize(MinLenDto, { name: 'ab' })).rejects.toThrow(BakerValidationError);
  });
  it('MaxLength 통과', async () => {
    const r = await deserialize<MaxLenDto>(MaxLenDto, { code: 'abcde' });
    expect(r.code).toBe('abcde');
  });
  it('MaxLength 초과 거부', async () => {
    await expect(deserialize(MaxLenDto, { code: 'abcdef' })).rejects.toThrow(BakerValidationError);
  });
});

describe('length', () => {
  it('범위 내 통과', async () => {
    const r = await deserialize<LengthDto>(LengthDto, { tag: 'hello' });
    expect(r.tag).toBe('hello');
  });
  it('미달 거부', async () => {
    await expect(deserialize(LengthDto, { tag: 'a' })).rejects.toThrow(BakerValidationError);
  });
});

describe('matches', () => {
  it('패턴 일치 통과', async () => {
    const r = await deserialize<MatchesDto>(MatchesDto, { slug: 'hello' });
    expect(r.slug).toBe('hello');
  });
  it('패턴 불일치 거부', async () => {
    await expect(deserialize(MatchesDto, { slug: 'Hello123' })).rejects.toThrow(BakerValidationError);
  });
});

describe('contains', () => {
  it('포함 문자열 통과', async () => {
    const r = await deserialize<ContainsDto>(ContainsDto, { greeting: 'say hello world' });
    expect(r.greeting).toBe('say hello world');
  });
  it('미포함 거부', async () => {
    await expect(deserialize(ContainsDto, { greeting: 'goodbye' })).rejects.toThrow(BakerValidationError);
  });
});
