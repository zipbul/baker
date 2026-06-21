import { bench, group, run } from 'mitata';

import { Baker, createRule, Field } from '../index';
import { isString } from '../src/rules/index';

const baker = new Baker();

const directRule = (value: unknown) => typeof value === 'string';
const wrappedRule = createRule({
  name: 'wrappedString',
  validate: directRule,
});

@baker.Recipe
class BuiltinDto {
  @Field(isString)
  value!: string;
}

@baker.Recipe
class CustomRuleDto {
  @Field(wrappedRule)
  value!: string;
}

@baker.Recipe
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
baker.seal();
baker.deserialize(BuiltinDto, { value: 'x' });
baker.deserialize(CustomRuleDto, { value: 'x' });
baker.deserialize(TransformDto, { value: 'x' });

let sink: unknown;

group('proof — sync overhead hotspots', () => {
  bench('direct sync rule fn', () => {
    sink = directRule('x');
  });

  bench('createRule sync wrapper fn', () => {
    sink = wrappedRule('x');
  });

  bench('deserialize builtin rule DTO', () => {
    sink = baker.deserialize(BuiltinDto, { value: 'x' });
  });

  bench('deserialize custom rule DTO', () => {
    sink = baker.deserialize(CustomRuleDto, { value: 'x' });
  });

  bench('deserialize sync transform DTO', () => {
    sink = baker.deserialize(TransformDto, { value: 'x' });
  });
});

await run();

// Force tsc to treat 'sink' as used (it's a DCE-prevention write-only target).
void sink;
