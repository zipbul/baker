import { describe, it, expect, afterEach } from 'bun:test';
import {
  seal, deserialize, BakerValidationError,
  IsString, NotContains, IsLowercase, IsUppercase, IsBooleanString, IsJSON,
  ArrayNotContains, IsArray,
} from '../../index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class NotContainsDto { @IsString() @NotContains('bad') val!: string; }
class LowercaseDto { @IsLowercase() val!: string; }
class UppercaseDto { @IsUppercase() val!: string; }
class BoolStringDto { @IsBooleanString() val!: string; }
class JsonDto { @IsJSON() val!: string; }
class ArrNotContainsDto { @IsArray() @ArrayNotContains([99]) items!: number[]; }

// ─────────────────────────────────────────────────────────────────────────────

describe('@NotContains', () => {
  it('미포함 문자열 통과', async () => {
    seal();
    const r = await deserialize<NotContainsDto>(NotContainsDto, { val: 'good text' });
    expect(r.val).toBe('good text');
  });
  it('포함 문자열 거부', async () => {
    seal();
    await expect(deserialize(NotContainsDto, { val: 'bad word' })).rejects.toThrow(BakerValidationError);
  });
});

describe('@IsLowercase / @IsUppercase', () => {
  it('소문자 통과', async () => {
    seal();
    const r = await deserialize<LowercaseDto>(LowercaseDto, { val: 'hello' });
    expect(r.val).toBe('hello');
  });
  it('대문자 포함 거부', async () => {
    seal();
    await expect(deserialize(LowercaseDto, { val: 'Hello' })).rejects.toThrow(BakerValidationError);
  });
  it('대문자 통과', async () => {
    seal();
    const r = await deserialize<UppercaseDto>(UppercaseDto, { val: 'HELLO' });
    expect(r.val).toBe('HELLO');
  });
  it('소문자 포함 거부', async () => {
    seal();
    await expect(deserialize(UppercaseDto, { val: 'Hello' })).rejects.toThrow(BakerValidationError);
  });
});

describe('@IsBooleanString', () => {
  it('"true" 통과', async () => {
    seal();
    const r = await deserialize<BoolStringDto>(BoolStringDto, { val: 'true' });
    expect(r.val).toBe('true');
  });
  it('"false" 통과', async () => {
    seal();
    const r = await deserialize<BoolStringDto>(BoolStringDto, { val: 'false' });
    expect(r.val).toBe('false');
  });
  it('다른 문자열 거부', async () => {
    seal();
    await expect(deserialize(BoolStringDto, { val: 'yes' })).rejects.toThrow(BakerValidationError);
  });
});

describe('@IsJSON', () => {
  it('유효한 JSON 통과', async () => {
    seal();
    const r = await deserialize<JsonDto>(JsonDto, { val: '{"a":1}' });
    expect(r.val).toBe('{"a":1}');
  });
  it('잘못된 JSON 거부', async () => {
    seal();
    await expect(deserialize(JsonDto, { val: '{bad}' })).rejects.toThrow(BakerValidationError);
  });
});

describe('@ArrayNotContains', () => {
  it('금지 요소 미포함 통과', async () => {
    seal();
    const r = await deserialize<ArrNotContainsDto>(ArrNotContainsDto, { items: [1, 2, 3] });
    expect(r.items).toEqual([1, 2, 3]);
  });
  it('금지 요소 포함 거부', async () => {
    seal();
    await expect(deserialize(ArrNotContainsDto, { items: [1, 99, 3] })).rejects.toThrow(BakerValidationError);
  });
});
