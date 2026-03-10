import { describe, it, expect, afterEach } from 'bun:test';
import { Field, deserialize, BakerValidationError } from '../../index';
import { equals, notEquals, isIn, isNotIn, isEmpty, isNotEmpty, isEnum } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class EqualsDto { @Field(equals('yes')) answer!: string; }
class NotEqualsDto { @Field(notEquals('no')) answer!: string; }
class IsInDto { @Field(isIn(['a', 'b', 'c'])) choice!: string; }
class IsNotInDto { @Field(isNotIn([1, 2, 3])) val!: number; }
class IsEmptyDto { @Field(isEmpty) field!: unknown; }
class IsNotEmptyDto { @Field(isNotEmpty) field!: unknown; }

enum Color { Red = 'red', Green = 'green', Blue = 'blue' }
class EnumDto { @Field(isEnum(Color)) color!: Color; }

// ─────────────────────────────────────────────────────────────────────────────

describe('@Equals', () => {
  it('일치 통과', async () => {
    const r = await deserialize<EqualsDto>(EqualsDto, { answer: 'yes' });
    expect(r.answer).toBe('yes');
  });
  it('불일치 거부', async () => {
    await expect(deserialize(EqualsDto, { answer: 'no' })).rejects.toThrow(BakerValidationError);
  });
});

describe('@NotEquals', () => {
  it('불일치 통과', async () => {
    const r = await deserialize<NotEqualsDto>(NotEqualsDto, { answer: 'yes' });
    expect(r.answer).toBe('yes');
  });
  it('일치 거부', async () => {
    await expect(deserialize(NotEqualsDto, { answer: 'no' })).rejects.toThrow(BakerValidationError);
  });
});

describe('@IsIn', () => {
  it('목록 내 통과', async () => {
    const r = await deserialize<IsInDto>(IsInDto, { choice: 'b' });
    expect(r.choice).toBe('b');
  });
  it('목록 외 거부', async () => {
    await expect(deserialize(IsInDto, { choice: 'z' })).rejects.toThrow(BakerValidationError);
  });
});

describe('@IsNotIn', () => {
  it('목록 외 통과', async () => {
    const r = await deserialize<IsNotInDto>(IsNotInDto, { val: 5 });
    expect(r.val).toBe(5);
  });
  it('목록 내 거부', async () => {
    await expect(deserialize(IsNotInDto, { val: 2 })).rejects.toThrow(BakerValidationError);
  });
});

describe('@IsEmpty', () => {
  it('빈 문자열 통과', async () => {
    const r = await deserialize<IsEmptyDto>(IsEmptyDto, { field: '' });
    expect(r.field).toBe('');
  });
  it('비어있지 않은 값 거부', async () => {
    await expect(deserialize(IsEmptyDto, { field: 'hello' })).rejects.toThrow(BakerValidationError);
  });
});

describe('@IsNotEmpty', () => {
  it('비어있지 않은 값 통과', async () => {
    const r = await deserialize<IsNotEmptyDto>(IsNotEmptyDto, { field: 'hello' });
    expect(r.field).toBe('hello');
  });
  it('빈 문자열 거부', async () => {
    await expect(deserialize(IsNotEmptyDto, { field: '' })).rejects.toThrow(BakerValidationError);
  });
});

describe('@IsEnum', () => {
  it('enum 값 통과', async () => {
    const r = await deserialize<EnumDto>(EnumDto, { color: 'red' });
    expect(r.color).toBe(Color.Red);
  });
  it('다른 enum 값 통과', async () => {
    const r = await deserialize<EnumDto>(EnumDto, { color: 'blue' });
    expect(r.color).toBe(Color.Blue);
  });
  it('enum 외 값 거부', async () => {
    await expect(deserialize(EnumDto, { color: 'purple' })).rejects.toThrow(BakerValidationError);
  });
  it('숫자 enum 거부', async () => {
    await expect(deserialize(EnumDto, { color: 0 })).rejects.toThrow(BakerValidationError);
  });
});
