import { afterEach, describe, expect, it } from 'bun:test';
import { deserialize, Field, isBakerError } from '../../index';
import {
  arrayContains,
  arrayMaxSize,
  arrayMinSize,
  arrayNotContains,
  arrayNotEmpty,
  arrayUnique,
  contains,
  equals,
  isDate,
  isEmail,
  isEmpty,
  isEnum,
  isIn,
  isInt,
  isNotEmpty,
  isNotEmptyObject,
  isNotIn,
  isNumber,
  isObject,
  isPositive,
  max,
  maxDate,
  maxLength,
  min,
  minDate,
  minLength,
  notEquals,
} from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

type RuleCase = {
  name: string;
  rule: (value: unknown) => boolean | Promise<boolean>;
  samples: unknown[];
};

async function passesWithDto(rule: any, value: unknown): Promise<boolean> {
  class Dto {
    @Field(rule)
    value!: unknown;
  }

  const result = await deserialize(Dto, { value });
  return !isBakerError(result);
}

async function expectParity(testCase: RuleCase): Promise<void> {
  for (const sample of testCase.samples) {
    const runtime = !!(await testCase.rule(sample));
    const dto = await passesWithDto(testCase.rule, sample);
    expect(
      dto,
      `${testCase.name} parity mismatch for ${String(sample)}`,
    ).toBe(runtime);
  }
}

enum Role {
  User = 'user',
  Admin = 'admin',
}

const ruleCases: RuleCase[] = [
  {
    name: 'isNumber()',
    rule: isNumber(),
    samples: [0, 1.5, NaN, Infinity, '1', true, null],
  },
  {
    name: 'min(0)',
    rule: min(0),
    samples: [0, 1, -1, NaN, '3', null],
  },
  {
    name: 'max(5)',
    rule: max(5),
    samples: [5, 4, 6, NaN, '4', false],
  },
  {
    name: 'isPositive',
    rule: isPositive,
    samples: [1, 0, -1, NaN, '1'],
  },
  {
    name: 'isInt',
    rule: isInt,
    samples: [1, 1.5, NaN, '1', null],
  },
  {
    name: 'minLength(2)',
    rule: minLength(2),
    samples: ['ab', 'a', '', 12, null],
  },
  {
    name: 'maxLength(3)',
    rule: maxLength(3),
    samples: ['abc', 'abcd', '', 1234, []],
  },
  {
    name: 'contains("a")',
    rule: contains('a'),
    samples: ['a', 'cat', 'dog', ['a'], 1],
  },
  {
    name: 'isEmail()',
    rule: isEmail(),
    samples: ['a@test.com', 'bad', '', 1, null],
  },
  {
    name: 'isDate',
    rule: isDate,
    samples: [new Date('2024-01-01T00:00:00.000Z'), new Date('invalid'), '2024-01-01', 1],
  },
  {
    name: 'minDate(2020-01-01)',
    rule: minDate(new Date('2020-01-01T00:00:00.000Z')),
    samples: [
      new Date('2020-01-01T00:00:00.000Z'),
      new Date('2021-01-01T00:00:00.000Z'),
      new Date('2019-12-31T23:59:59.999Z'),
      new Date('invalid'),
      '2021-01-01',
    ],
  },
  {
    name: 'maxDate(2025-01-01)',
    rule: maxDate(new Date('2025-01-01T00:00:00.000Z')),
    samples: [
      new Date('2024-12-31T23:59:59.999Z'),
      new Date('2025-01-01T00:00:00.000Z'),
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('invalid'),
      123,
    ],
  },
  {
    name: 'arrayMinSize(2)',
    rule: arrayMinSize(2),
    samples: [[1, 2], [1], [], 'ab', 'abc', null],
  },
  {
    name: 'arrayMaxSize(2)',
    rule: arrayMaxSize(2),
    samples: [[1], [1, 2], [1, 2, 3], 'a', 'ab', 'abc'],
  },
  {
    name: 'arrayContains(["a"])',
    rule: arrayContains(['a']),
    samples: [['a'], ['a', 'b'], ['b'], 'a', 'cat', null],
  },
  {
    name: 'arrayNotContains(["z"])',
    rule: arrayNotContains(['z']),
    samples: [['a'], ['z'], [], 'abc', 'zzz', null],
  },
  {
    name: 'arrayUnique()',
    rule: arrayUnique(),
    samples: [[1, 2], [1, 1], [], 'abc', 'aba'],
  },
  {
    name: 'arrayNotEmpty',
    rule: arrayNotEmpty,
    samples: [[1], [], 'x', '', null],
  },
  {
    name: 'isObject',
    rule: isObject,
    samples: [{ a: 1 }, {}, [], 'x', null],
  },
  {
    name: 'isNotEmptyObject()',
    rule: isNotEmptyObject(),
    samples: [{ a: 1 }, {}, 'x', [], null],
  },
  {
    name: 'equals("x")',
    rule: equals('x'),
    samples: ['x', 'y', 1, null],
  },
  {
    name: 'notEquals("x")',
    rule: notEquals('x'),
    samples: ['x', 'y', 1, false],
  },
  {
    name: 'isIn(["a","b"])',
    rule: isIn(['a', 'b']),
    samples: ['a', 'b', 'c', 1, null],
  },
  {
    name: 'isNotIn(["x"])',
    rule: isNotIn(['x']),
    samples: ['x', 'y', false, 1],
  },
  {
    name: 'isEmpty',
    rule: isEmpty,
    samples: ['', 'x', 0, false],
  },
  {
    name: 'isNotEmpty',
    rule: isNotEmpty,
    samples: ['x', '', 0, false],
  },
  {
    name: 'isEnum(Role)',
    rule: isEnum(Role),
    samples: [Role.User, Role.Admin, 'guest', 1, null],
  },
];

describe('rule semantics parity', () => {
  for (const testCase of ruleCases) {
    it(testCase.name, async () => {
      await expectParity(testCase);
    });
  }
});
