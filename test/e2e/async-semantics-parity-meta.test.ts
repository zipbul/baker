import { afterEach, describe, expect, it } from 'bun:test';
import { createRule, deserialize, Field, isBakerError, serialize, validate } from '../../index';
import { isNumber, isString } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

const asyncEven = createRule({
  name: 'asyncEven',
  validate: async (value) => typeof value === 'number' && value % 2 === 0,
  requiresType: 'number',
});

const asyncStartsWithA = createRule({
  name: 'asyncStartsWithA',
  validate: async (value) => typeof value === 'string' && value.startsWith('a'),
  requiresType: 'string',
});

describe('async semantics parity meta', () => {
  it('async custom rule matches validate() and DTO path', async () => {
    class Dto {
      @Field(isNumber(), asyncEven)
      value!: number;
    }

    const samples = [2, 3, '2', null];

    for (const sample of samples) {
      const adHoc = await validate(sample, asyncEven);
      const dto = await deserialize(Dto, { value: sample });
      expect(isBakerError(dto)).toBe(isBakerError(adHoc));
    }
  });

  it('async custom string rule matches validate() and DTO path', async () => {
    class Dto {
      @Field(isString, asyncStartsWithA)
      value!: string;
    }

    const samples = ['alice', 'bob', 1, null];

    for (const sample of samples) {
      const adHoc = await validate(sample, asyncStartsWithA);
      const dto = await deserialize(Dto, { value: sample });
      expect(isBakerError(dto)).toBe(isBakerError(adHoc));
    }
  });

  it('async deserialize transform parity', async () => {
    class Dto {
      @Field(isString, {
        transform: {
          deserialize: async ({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value,
          serialize: ({ value }) => value,
        },
      })
      value!: string;
    }

    const result = await deserialize<Dto>(Dto, { value: '  alice  ' }) as Dto;
    expect(result.value).toBe('ALICE');
  });

  it('async serialize transform parity with nested object', async () => {
    class ChildDto {
      @Field(isString)
      name!: string;
    }

    class ParentDto {
      @Field({ type: () => ChildDto })
      child!: ChildDto;

      @Field(isString, {
        transform: {
          deserialize: ({ value }) => value,
          serialize: async ({ value }) => `<${value}>`,
        },
      })
      label!: string;
    }

    const parent = Object.assign(new ParentDto(), {
      child: Object.assign(new ChildDto(), { name: 'neo' }),
      label: 'root',
    });

    const output = await serialize(parent);
    expect(output).toEqual({
      child: { name: 'neo' },
      label: '<root>',
    });
  });
});
