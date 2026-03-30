import { describe, it, expect } from 'bun:test';
import { deserialize, isBakerError, Field } from '../../index';
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
  it('valid email passes', async () => {
    const r = await deserialize(EmailDto, { email: 'test@example.com' }) as EmailDto;
    expect(r.email).toBe('test@example.com');
  });
  it('invalid email rejected', async () => {
    expect(isBakerError(await deserialize(EmailDto, { email: 'not-email' }))).toBe(true);
  });
});

describe('isUUID', () => {
  it('valid UUID v4 passes', async () => {
    const r = await deserialize(UUIDDto, { id: '550e8400-e29b-41d4-a716-446655440000' }) as UUIDDto;
    expect(r.id).toBe('550e8400-e29b-41d4-a716-446655440000');
  });
  it('invalid UUID rejected', async () => {
    expect(isBakerError(await deserialize(UUIDDto, { id: 'not-uuid' }))).toBe(true);
  });
});

describe('isIP', () => {
  it('IPv4 passes', async () => {
    const r = await deserialize(IPv4Dto, { ip: '192.168.1.1' }) as IPv4Dto;
    expect(r.ip).toBe('192.168.1.1');
  });
  it('IPv6 passes', async () => {
    const r = await deserialize(IPv6Dto, { ip: '::1' }) as IPv6Dto;
    expect(r.ip).toBe('::1');
  });
  it('IPv6 value rejected for IPv4', async () => {
    expect(isBakerError(await deserialize(IPv4Dto, { ip: '::1' }))).toBe(true);
  });
  it('invalid IP rejected', async () => {
    expect(isBakerError(await deserialize(IPv4Dto, { ip: 'not-ip' }))).toBe(true);
  });
});

describe('isURL', () => {
  it('valid URL passes', async () => {
    const r = await deserialize(URLDto, { url: 'https://example.com' }) as URLDto;
    expect(r.url).toBe('https://example.com');
  });
  it('invalid URL rejected', async () => {
    expect(isBakerError(await deserialize(URLDto, { url: 'not a url' }))).toBe(true);
  });

  // E-6: isURL port boundary
  it('port 65535 passes', async () => {
    const r = await deserialize(URLDto, { url: 'https://example.com:65535' }) as URLDto;
    expect(r.url).toBe('https://example.com:65535');
  });
  it('port 65536 rejected', async () => {
    expect(isBakerError(await deserialize(URLDto, { url: 'https://example.com:65536' }))).toBe(true);
  });
  it('port 99999 rejected', async () => {
    expect(isBakerError(await deserialize(URLDto, { url: 'https://example.com:99999' }))).toBe(true);
  });
  it('port 0 passes', async () => {
    const r = await deserialize(URLDto, { url: 'https://example.com:0' }) as URLDto;
    expect(r.url).toBe('https://example.com:0');
  });
});

describe('isISO8601', () => {
  it('valid ISO8601 passes', async () => {
    const r = await deserialize(ISO8601Dto, { ts: '2024-01-01T00:00:00.000Z' }) as ISO8601Dto;
    expect(r.ts).toBe('2024-01-01T00:00:00.000Z');
  });
  it('invalid date string rejected', async () => {
    expect(isBakerError(await deserialize(ISO8601Dto, { ts: 'not-a-date' }))).toBe(true);
  });
});

describe('minLength / maxLength', () => {
  it('MinLength passes', async () => {
    const r = await deserialize(MinLenDto, { name: 'abc' }) as MinLenDto;
    expect(r.name).toBe('abc');
  });
  it('MinLength below minimum rejected', async () => {
    expect(isBakerError(await deserialize(MinLenDto, { name: 'ab' }))).toBe(true);
  });
  it('MaxLength passes', async () => {
    const r = await deserialize(MaxLenDto, { code: 'abcde' }) as MaxLenDto;
    expect(r.code).toBe('abcde');
  });
  it('MaxLength exceeded rejected', async () => {
    expect(isBakerError(await deserialize(MaxLenDto, { code: 'abcdef' }))).toBe(true);
  });
});

describe('length', () => {
  it('within range passes', async () => {
    const r = await deserialize(LengthDto, { tag: 'hello' }) as LengthDto;
    expect(r.tag).toBe('hello');
  });
  it('below minimum rejected', async () => {
    expect(isBakerError(await deserialize(LengthDto, { tag: 'a' }))).toBe(true);
  });
});

describe('matches', () => {
  it('pattern match passes', async () => {
    const r = await deserialize(MatchesDto, { slug: 'hello' }) as MatchesDto;
    expect(r.slug).toBe('hello');
  });
  it('pattern mismatch rejected', async () => {
    expect(isBakerError(await deserialize(MatchesDto, { slug: 'Hello123' }))).toBe(true);
  });
});

describe('contains', () => {
  it('containing substring passes', async () => {
    const r = await deserialize(ContainsDto, { greeting: 'say hello world' }) as ContainsDto;
    expect(r.greeting).toBe('say hello world');
  });
  it('not containing rejected', async () => {
    expect(isBakerError(await deserialize(ContainsDto, { greeting: 'goodbye' }))).toBe(true);
  });
});
