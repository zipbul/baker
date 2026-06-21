import { describe, it, expect, beforeEach } from 'bun:test';

import { Baker, isBakerIssueSet, Field } from '../../index';
import {
  isString,
  isEmail,
  isUUID,
  isIP,
  isURL,
  isISO8601,
  minLength,
  maxLength,
  matches,
  contains,
  length,
} from '../../src/rules/index';
import { assertBakerIssueSet } from '../integration/helpers/assert';

const baker = new Baker();

beforeEach(() => baker.seal());
// ─────────────────────────────────────────────────────────────────────────────

@baker.Recipe
class EmailDto {
  @Field(isEmail()) email!: string;
}
@baker.Recipe
class UUIDDto {
  @Field(isUUID()) id!: string;
}
@baker.Recipe
class IPv4Dto {
  @Field(isIP(4)) ip!: string;
}
@baker.Recipe
class IPv6Dto {
  @Field(isIP(6)) ip!: string;
}
@baker.Recipe
class URLDto {
  @Field(isURL()) url!: string;
}
@baker.Recipe
class ISO8601Dto {
  @Field(isISO8601()) ts!: string;
}

@baker.Recipe
class ISO8601StrictDto {
  @Field(isISO8601({ strict: true })) ts!: string;
}

@baker.Recipe
class MinLenDto {
  @Field(isString, minLength(3)) name!: string;
}
@baker.Recipe
class MaxLenDto {
  @Field(isString, maxLength(5)) code!: string;
}
@baker.Recipe
class LengthDto {
  @Field(isString, length(2, 10)) tag!: string;
}
@baker.Recipe
class MatchesDto {
  @Field(isString, matches(/^[a-z]+$/)) slug!: string;
}
@baker.Recipe
class ContainsDto {
  @Field(isString, contains('hello')) greeting!: string;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('isEmail', () => {
  it('valid email passes', async () => {
    const r = (await baker.deserialize(EmailDto, { email: 'test@example.com' })) as EmailDto;
    expect(r.email).toBe('test@example.com');
  });
  it('invalid email rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(EmailDto, { email: 'not-email' }))).toBe(true);
  });
});

describe('isUUID', () => {
  it('valid UUID v4 passes', async () => {
    const r = (await baker.deserialize(UUIDDto, { id: '550e8400-e29b-41d4-a716-446655440000' })) as UUIDDto;
    expect(r.id).toBe('550e8400-e29b-41d4-a716-446655440000');
  });
  it('invalid UUID rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(UUIDDto, { id: 'not-uuid' }))).toBe(true);
  });
});

describe('isIP', () => {
  it('IPv4 passes', async () => {
    const r = (await baker.deserialize(IPv4Dto, { ip: '192.168.1.1' })) as IPv4Dto;
    expect(r.ip).toBe('192.168.1.1');
  });
  it('IPv6 passes', async () => {
    const r = (await baker.deserialize(IPv6Dto, { ip: '::1' })) as IPv6Dto;
    expect(r.ip).toBe('::1');
  });
  it('IPv6 value rejected for IPv4', async () => {
    expect(isBakerIssueSet(await baker.deserialize(IPv4Dto, { ip: '::1' }))).toBe(true);
  });
  it('invalid IP rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(IPv4Dto, { ip: 'not-ip' }))).toBe(true);
  });
});

describe('isURL', () => {
  it('valid URL passes', async () => {
    const r = (await baker.deserialize(URLDto, { url: 'https://example.com' })) as URLDto;
    expect(r.url).toBe('https://example.com');
  });
  it('invalid URL rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(URLDto, { url: 'not a url' }))).toBe(true);
  });

  // E-6: isURL port boundary
  it('port 65535 passes', async () => {
    const r = (await baker.deserialize(URLDto, { url: 'https://example.com:65535' })) as URLDto;
    expect(r.url).toBe('https://example.com:65535');
  });
  it('port 65536 rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(URLDto, { url: 'https://example.com:65536' }))).toBe(true);
  });
  it('port 99999 rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(URLDto, { url: 'https://example.com:99999' }))).toBe(true);
  });
  it('port 0 passes', async () => {
    const r = (await baker.deserialize(URLDto, { url: 'https://example.com:0' })) as URLDto;
    expect(r.url).toBe('https://example.com:0');
  });
});

describe('isISO8601', () => {
  it('valid ISO8601 passes', async () => {
    const r = (await baker.deserialize(ISO8601Dto, { ts: '2024-01-01T00:00:00.000Z' })) as ISO8601Dto;
    expect(r.ts).toBe('2024-01-01T00:00:00.000Z');
  });
  it('invalid date string rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(ISO8601Dto, { ts: 'not-a-date' }))).toBe(true);
  });
});

// Exercises the strict-mode codegen branch (month range always, day range when present),
// which the JS validate path tests cover but the emitted executor did not until now.
describe('isISO8601 strict — codegen executor', () => {
  const accept = async (ts: string) => expect(isBakerIssueSet(await baker.deserialize(ISO8601StrictDto, { ts }))).toBe(false);
  const reject = async (ts: string) => expect(isBakerIssueSet(await baker.deserialize(ISO8601StrictDto, { ts }))).toBe(true);

  it('accepts valid year-month and full date', async () => {
    await accept('2021-12');
    await accept('2021-12-31');
  });
  it('rejects out-of-range month', async () => {
    await reject('2021-13');
    await reject('2021-00');
  });
  it('rejects out-of-range day', async () => {
    await reject('2021-02-30');
  });
  it('emits exactly one isISO8601 issue when both date and time are out of range (collect-errors mode)', async () => {
    const result = await baker.deserialize(ISO8601StrictDto, { ts: '2021-13-01T25:61:61' });
    assertBakerIssueSet(result);
    expect(result.errors.filter(e => e.code === 'isISO8601')).toHaveLength(1);
  });
});

describe('minLength / maxLength', () => {
  it('MinLength passes', async () => {
    const r = (await baker.deserialize(MinLenDto, { name: 'abc' })) as MinLenDto;
    expect(r.name).toBe('abc');
  });
  it('MinLength below minimum rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(MinLenDto, { name: 'ab' }))).toBe(true);
  });
  it('MaxLength passes', async () => {
    const r = (await baker.deserialize(MaxLenDto, { code: 'abcde' })) as MaxLenDto;
    expect(r.code).toBe('abcde');
  });
  it('MaxLength exceeded rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(MaxLenDto, { code: 'abcdef' }))).toBe(true);
  });
});

describe('length', () => {
  it('within range passes', async () => {
    const r = (await baker.deserialize(LengthDto, { tag: 'hello' })) as LengthDto;
    expect(r.tag).toBe('hello');
  });
  it('below minimum rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(LengthDto, { tag: 'a' }))).toBe(true);
  });
  // Multi-length-rule field exercises insideTypeGate=true codegen path where
  // stripSelfComparison keeps 2+ non-self-comparison checks on length(min,max).
  it('length(2,10) + minLength(1) on same field — codegen shares length var', async () => {
    const b = new Baker();
    @b.Recipe
    class MultiLenDto {
      @Field(isString, length(2, 10), minLength(1)) v!: string;
    }
    b.seal();
    const ok = (await b.deserialize<MultiLenDto>(MultiLenDto, { v: 'hello' })) as MultiLenDto;
    expect(ok.v).toBe('hello');
    expect(isBakerIssueSet(await b.deserialize(MultiLenDto, { v: 'x' }))).toBe(true);
  });
});

describe('matches', () => {
  it('pattern match passes', async () => {
    const r = (await baker.deserialize(MatchesDto, { slug: 'hello' })) as MatchesDto;
    expect(r.slug).toBe('hello');
  });
  it('pattern mismatch rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(MatchesDto, { slug: 'Hello123' }))).toBe(true);
  });
});

describe('contains', () => {
  it('containing substring passes', async () => {
    const r = (await baker.deserialize(ContainsDto, { greeting: 'say hello world' })) as ContainsDto;
    expect(r.greeting).toBe('say hello world');
  });
  it('not containing rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(ContainsDto, { greeting: 'goodbye' }))).toBe(true);
  });
});
