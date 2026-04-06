import { bench, group, run } from 'mitata';
import { createRule, deserialize, Field } from '../index';
import { isString } from '../src/rules/index';

const directRule = (value: unknown) => typeof value === 'string';
const wrappedRule = createRule({
  name: 'wrappedString',
  validate: directRule,
});

class BuiltinDto {
  @Field(isString)
  value!: string;
}

class CustomRuleDto {
  @Field(wrappedRule)
  value!: string;
}

class TransformDto {
  @Field(isString, {
    transform: {
      deserialize: ({ value }) => value,
      serialize: ({ value }) => value,
    },
  })
  value!: string;
}

// Warm seal
deserialize(BuiltinDto, { value: 'x' });
deserialize(CustomRuleDto, { value: 'x' });
deserialize(TransformDto, { value: 'x' });

let sink: unknown;

group('proof — sync overhead hotspots', () => {
  bench('direct sync rule fn', () => {
    sink = directRule('x');
  });

  bench('createRule sync wrapper fn', () => {
    sink = wrappedRule('x');
  });

  bench('deserialize builtin rule DTO', () => {
    sink = deserialize(BuiltinDto, { value: 'x' });
  });

  bench('deserialize custom rule DTO', () => {
    sink = deserialize(CustomRuleDto, { value: 'x' });
  });

  bench('deserialize sync transform DTO', () => {
    sink = deserialize(TransformDto, { value: 'x' });
  });
});

await run();
