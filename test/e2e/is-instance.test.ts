import { describe, it, expect, afterEach, beforeEach } from 'bun:test';

import { Baker, Field, deserialize, isBakerIssueSet } from '../../index';
import { isInstance } from '../../src/rules/index';
import { sealClass } from '../integration/helpers/seal';
import { unseal } from '../integration/helpers/unseal';

const baker = new Baker();

beforeEach(() => baker.seal());
afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class MyDate extends Date {}

@baker.Recipe
class InstanceDto {
  @Field(isInstance(MyDate), {
    transform: {
      deserialize: ({ value }) => {
        if (typeof value === 'string') {
          return new MyDate(value);
        }
        return value;
      },
      serialize: ({ value }) => value,
    },
  })
  date!: MyDate;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('@IsInstance', () => {
  it('correct instance passes', async () => {
    const r = (await deserialize(InstanceDto, { date: '2024-01-01' })) as InstanceDto;
    expect(r.date).toBeInstanceOf(MyDate);
  });

  it('wrong type rejected', async () => {
    class WrongDto {
      @Field(isInstance(MyDate))
      date!: MyDate;
    }
    sealClass(WrongDto);

    // A string is not a MyDate instance (raw string passed without Transform)
    expect(isBakerIssueSet(await deserialize(WrongDto, { date: '2024-01-01' }))).toBe(true);
  });
});
