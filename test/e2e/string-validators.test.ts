import { describe, it, expect, afterEach } from 'bun:test';
import {
  seal, deserialize, BakerValidationError,
  IsString, IsEmail, IsUUID, IsIP, IsURL, IsISO8601,
  MinLength, MaxLength, Matches, Contains, Length,
} from '../../index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class EmailDto { @IsEmail() email!: string; }
class UUIDDto { @IsUUID() id!: string; }
class IPv4Dto { @IsIP(4) ip!: string; }
class IPv6Dto { @IsIP(6) ip!: string; }
class URLDto { @IsURL() url!: string; }
class ISO8601Dto { @IsISO8601() ts!: string; }

class MinLenDto {
  @IsString() @MinLength(3) name!: string;
}
class MaxLenDto {
  @IsString() @MaxLength(5) code!: string;
}
class LengthDto {
  @IsString() @Length(2, 10) tag!: string;
}
class MatchesDto {
  @IsString() @Matches(/^[a-z]+$/) slug!: string;
}
class ContainsDto {
  @IsString() @Contains('hello') greeting!: string;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('@IsEmail', () => {
  it('유효한 이메일 통과', async () => {
    seal();
    const r = await deserialize<EmailDto>(EmailDto, { email: 'test@example.com' });
    expect(r.email).toBe('test@example.com');
  });
  it('잘못된 이메일 거부', async () => {
    seal();
    await expect(deserialize(EmailDto, { email: 'not-email' })).rejects.toThrow(BakerValidationError);
  });
});

describe('@IsUUID', () => {
  it('유효한 UUID v4 통과', async () => {
    seal();
    const r = await deserialize<UUIDDto>(UUIDDto, { id: '550e8400-e29b-41d4-a716-446655440000' });
    expect(r.id).toBe('550e8400-e29b-41d4-a716-446655440000');
  });
  it('잘못된 UUID 거부', async () => {
    seal();
    await expect(deserialize(UUIDDto, { id: 'not-uuid' })).rejects.toThrow(BakerValidationError);
  });
});

describe('@IsIP', () => {
  it('IPv4 통과', async () => {
    seal();
    const r = await deserialize<IPv4Dto>(IPv4Dto, { ip: '192.168.1.1' });
    expect(r.ip).toBe('192.168.1.1');
  });
  it('IPv6 통과', async () => {
    seal();
    const r = await deserialize<IPv6Dto>(IPv6Dto, { ip: '::1' });
    expect(r.ip).toBe('::1');
  });
  it('IPv4에 IPv6 값 거부', async () => {
    seal();
    await expect(deserialize(IPv4Dto, { ip: '::1' })).rejects.toThrow(BakerValidationError);
  });
  it('잘못된 IP 거부', async () => {
    seal();
    await expect(deserialize(IPv4Dto, { ip: 'not-ip' })).rejects.toThrow(BakerValidationError);
  });
});

describe('@IsURL', () => {
  it('유효한 URL 통과', async () => {
    seal();
    const r = await deserialize<URLDto>(URLDto, { url: 'https://example.com' });
    expect(r.url).toBe('https://example.com');
  });
  it('잘못된 URL 거부', async () => {
    seal();
    await expect(deserialize(URLDto, { url: 'not a url' })).rejects.toThrow(BakerValidationError);
  });
});

describe('@IsISO8601', () => {
  it('유효한 ISO8601 통과', async () => {
    seal();
    const r = await deserialize<ISO8601Dto>(ISO8601Dto, { ts: '2024-01-01T00:00:00.000Z' });
    expect(r.ts).toBe('2024-01-01T00:00:00.000Z');
  });
  it('잘못된 날짜 문자열 거부', async () => {
    seal();
    await expect(deserialize(ISO8601Dto, { ts: 'not-a-date' })).rejects.toThrow(BakerValidationError);
  });
});

describe('@MinLength / @MaxLength', () => {
  it('MinLength 통과', async () => {
    seal();
    const r = await deserialize<MinLenDto>(MinLenDto, { name: 'abc' });
    expect(r.name).toBe('abc');
  });
  it('MinLength 미달 거부', async () => {
    seal();
    await expect(deserialize(MinLenDto, { name: 'ab' })).rejects.toThrow(BakerValidationError);
  });
  it('MaxLength 통과', async () => {
    seal();
    const r = await deserialize<MaxLenDto>(MaxLenDto, { code: 'abcde' });
    expect(r.code).toBe('abcde');
  });
  it('MaxLength 초과 거부', async () => {
    seal();
    await expect(deserialize(MaxLenDto, { code: 'abcdef' })).rejects.toThrow(BakerValidationError);
  });
});

describe('@Length', () => {
  it('범위 내 통과', async () => {
    seal();
    const r = await deserialize<LengthDto>(LengthDto, { tag: 'hello' });
    expect(r.tag).toBe('hello');
  });
  it('미달 거부', async () => {
    seal();
    await expect(deserialize(LengthDto, { tag: 'a' })).rejects.toThrow(BakerValidationError);
  });
});

describe('@Matches', () => {
  it('패턴 일치 통과', async () => {
    seal();
    const r = await deserialize<MatchesDto>(MatchesDto, { slug: 'hello' });
    expect(r.slug).toBe('hello');
  });
  it('패턴 불일치 거부', async () => {
    seal();
    await expect(deserialize(MatchesDto, { slug: 'Hello123' })).rejects.toThrow(BakerValidationError);
  });
});

describe('@Contains', () => {
  it('포함 문자열 통과', async () => {
    seal();
    const r = await deserialize<ContainsDto>(ContainsDto, { greeting: 'say hello world' });
    expect(r.greeting).toBe('say hello world');
  });
  it('미포함 거부', async () => {
    seal();
    await expect(deserialize(ContainsDto, { greeting: 'goodbye' })).rejects.toThrow(BakerValidationError);
  });
});
