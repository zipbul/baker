import { describe, it, expect, afterEach } from 'bun:test';
import { Field, deserialize, BakerValidationError } from '../../index';
import { isInstance } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class MyDate extends Date {}

class InstanceDto {
  @Field(isInstance(MyDate), {
    transform: ({ value }) => {
      if (typeof value === 'string') return new MyDate(value);
      return value;
    },
  })
  date!: MyDate;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('@IsInstance', () => {
  it('correct instance passes', async () => {
    const r = await deserialize<InstanceDto>(InstanceDto, { date: '2024-01-01' });
    expect(r.date).toBeInstanceOf(MyDate);
  });

  it('wrong type rejected', async () => {
    class WrongDto {
      @Field(isInstance(MyDate))
      date!: MyDate;
    }

    // A string is not a MyDate instance (raw string passed without Transform)
    await expect(
      deserialize(WrongDto, { date: '2024-01-01' }),
    ).rejects.toThrow(BakerValidationError);
  });
});
