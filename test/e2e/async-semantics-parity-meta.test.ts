import { afterEach, describe, expect, it } from 'bun:test';

import { createRule, Field, isBakerIssueSet, RequiredType } from '../../index';
import { isNumber, isString } from '../../src/rules/index';
import { sealClass } from '../integration/helpers/seal';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

const asyncEven = createRule({
  name: 'asyncEven',
  validate: async value => typeof value === 'number' && value % 2 === 0,
  requiresType: RequiredType.Number,
});

const asyncTrimUpper = async ({ value }: { value: unknown }): Promise<unknown> => {
  if (typeof value === 'string') {
    return value.trim().toUpperCase();
  }
  return value;
};
const passthrough = ({ value }: { value: unknown }): unknown => value;

const asyncStartsWithA = createRule({
  name: 'asyncStartsWithA',
  validate: async value => typeof value === 'string' && value.startsWith('a'),
  requiresType: RequiredType.String,
});

describe('async semantics parity meta', () => {
  it('async custom rule matches validate() and DTO path', async () => {
    class Dto {
      @Field(isNumber(), asyncEven)
      value!: number;
    }
    const baker = sealClass(Dto);

    const samples = [2, 3, '2', null];

    for (const sample of samples) {
      const rulePass = await asyncEven(sample);
      const dto = await baker.deserialize(Dto, { value: sample });
      expect(isBakerIssueSet(dto)).toBe(!rulePass);
    }
  });

  it('async custom string rule matches validate() and DTO path', async () => {
    class Dto {
      @Field(isString, asyncStartsWithA)
      value!: string;
    }
    const baker = sealClass(Dto);

    const samples = ['alice', 'bob', 1, null];

    for (const sample of samples) {
      const rulePass = await asyncStartsWithA(sample);
      const dto = await baker.deserialize(Dto, { value: sample });
      expect(isBakerIssueSet(dto)).toBe(!rulePass);
    }
  });

  it('async deserialize transform parity', async () => {
    class Dto {
      @Field(isString, {
        transform: {
          deserialize: asyncTrimUpper,
          serialize: passthrough,
        },
      })
      value!: string;
    }
    const baker = sealClass(Dto);

    const result = (await baker.deserialize<Dto>(Dto, { value: '  alice  ' })) as Dto;
    expect(result.value).toBe('ALICE');
  });

  it('async serialize transform parity with nested object', async () => {
    class ChildDto {
      @Field(isString)
      name!: string;
    }
    sealClass(ChildDto);

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
    const parentBaker = sealClass(ParentDto);

    const parent = Object.assign(new ParentDto(), {
      child: Object.assign(new ChildDto(), { name: 'neo' }),
      label: 'root',
    });

    const output = await parentBaker.serialize(parent);
    expect(output).toEqual({
      child: { name: 'neo' },
      label: '<root>',
    });
  });
});
