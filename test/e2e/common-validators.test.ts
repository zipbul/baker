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
  it('match passes', async () => {
    const r = await deserialize<EqualsDto>(EqualsDto, { answer: 'yes' });
    expect(r.answer).toBe('yes');
  });
  it('mismatch rejected', async () => {
    await expect(deserialize(EqualsDto, { answer: 'no' })).rejects.toThrow(BakerValidationError);
  });
});

describe('@NotEquals', () => {
  it('mismatch passes', async () => {
    const r = await deserialize<NotEqualsDto>(NotEqualsDto, { answer: 'yes' });
    expect(r.answer).toBe('yes');
  });
  it('match rejected', async () => {
    await expect(deserialize(NotEqualsDto, { answer: 'no' })).rejects.toThrow(BakerValidationError);
  });
});

describe('@IsIn', () => {
  it('value in list passes', async () => {
    const r = await deserialize<IsInDto>(IsInDto, { choice: 'b' });
    expect(r.choice).toBe('b');
  });
  it('value not in list rejected', async () => {
    await expect(deserialize(IsInDto, { choice: 'z' })).rejects.toThrow(BakerValidationError);
  });
});

describe('@IsNotIn', () => {
  it('value not in list passes', async () => {
    const r = await deserialize<IsNotInDto>(IsNotInDto, { val: 5 });
    expect(r.val).toBe(5);
  });
  it('value in list rejected', async () => {
    await expect(deserialize(IsNotInDto, { val: 2 })).rejects.toThrow(BakerValidationError);
  });
});

describe('@IsEmpty', () => {
  it('empty string passes', async () => {
    const r = await deserialize<IsEmptyDto>(IsEmptyDto, { field: '' });
    expect(r.field).toBe('');
  });
  it('non-empty value rejected', async () => {
    await expect(deserialize(IsEmptyDto, { field: 'hello' })).rejects.toThrow(BakerValidationError);
  });
});

describe('@IsNotEmpty', () => {
  it('non-empty value passes', async () => {
    const r = await deserialize<IsNotEmptyDto>(IsNotEmptyDto, { field: 'hello' });
    expect(r.field).toBe('hello');
  });
  it('empty string rejected', async () => {
    await expect(deserialize(IsNotEmptyDto, { field: '' })).rejects.toThrow(BakerValidationError);
  });
});

describe('@IsEnum', () => {
  it('enum value passes', async () => {
    const r = await deserialize<EnumDto>(EnumDto, { color: 'red' });
    expect(r.color).toBe(Color.Red);
  });
  it('another enum value passes', async () => {
    const r = await deserialize<EnumDto>(EnumDto, { color: 'blue' });
    expect(r.color).toBe(Color.Blue);
  });
  it('non-enum value rejected', async () => {
    await expect(deserialize(EnumDto, { color: 'purple' })).rejects.toThrow(BakerValidationError);
  });
  it('numeric enum rejected', async () => {
    await expect(deserialize(EnumDto, { color: 0 })).rejects.toThrow(BakerValidationError);
  });
});
