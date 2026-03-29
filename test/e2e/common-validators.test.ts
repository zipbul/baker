import { describe, it, expect, afterEach } from 'bun:test';
import { Field, deserialize, isBakerError } from '../../index';
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
    const r = await deserialize(EqualsDto, { answer: 'yes' }) as EqualsDto;
    expect(r.answer).toBe('yes');
  });
  it('mismatch rejected', async () => {
    expect(isBakerError(await deserialize(EqualsDto, { answer: 'no' }))).toBe(true);
  });
});

describe('@NotEquals', () => {
  it('mismatch passes', async () => {
    const r = await deserialize(NotEqualsDto, { answer: 'yes' }) as NotEqualsDto;
    expect(r.answer).toBe('yes');
  });
  it('match rejected', async () => {
    expect(isBakerError(await deserialize(NotEqualsDto, { answer: 'no' }))).toBe(true);
  });
});

describe('@IsIn', () => {
  it('value in list passes', async () => {
    const r = await deserialize(IsInDto, { choice: 'b' }) as IsInDto;
    expect(r.choice).toBe('b');
  });
  it('value not in list rejected', async () => {
    expect(isBakerError(await deserialize(IsInDto, { choice: 'z' }))).toBe(true);
  });
});

describe('@IsNotIn', () => {
  it('value not in list passes', async () => {
    const r = await deserialize(IsNotInDto, { val: 5 }) as IsNotInDto;
    expect(r.val).toBe(5);
  });
  it('value in list rejected', async () => {
    expect(isBakerError(await deserialize(IsNotInDto, { val: 2 }))).toBe(true);
  });
});

describe('@IsEmpty', () => {
  it('empty string passes', async () => {
    const r = await deserialize(IsEmptyDto, { field: '' }) as IsEmptyDto;
    expect(r.field).toBe('');
  });
  it('non-empty value rejected', async () => {
    expect(isBakerError(await deserialize(IsEmptyDto, { field: 'hello' }))).toBe(true);
  });
});

describe('@IsNotEmpty', () => {
  it('non-empty value passes', async () => {
    const r = await deserialize(IsNotEmptyDto, { field: 'hello' }) as IsNotEmptyDto;
    expect(r.field).toBe('hello');
  });
  it('empty string rejected', async () => {
    expect(isBakerError(await deserialize(IsNotEmptyDto, { field: '' }))).toBe(true);
  });
});

describe('@IsEnum', () => {
  it('enum value passes', async () => {
    const r = await deserialize(EnumDto, { color: 'red' }) as EnumDto;
    expect(r.color).toBe(Color.Red);
  });
  it('another enum value passes', async () => {
    const r = await deserialize(EnumDto, { color: 'blue' }) as EnumDto;
    expect(r.color).toBe(Color.Blue);
  });
  it('non-enum value rejected', async () => {
    expect(isBakerError(await deserialize(EnumDto, { color: 'purple' }))).toBe(true);
  });
  it('numeric enum rejected', async () => {
    expect(isBakerError(await deserialize(EnumDto, { color: 0 }))).toBe(true);
  });
});
