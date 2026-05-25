import { bench, group, run } from 'mitata';

import { Field, Recipe, deserialize, serialize, seal } from '../index';
import { isString, minLength } from '../src/rules/index';

@Recipe
class PlainDto {
  @Field(isString, minLength(1))
  value!: string;
}

@Recipe
class GroupDto {
  @Field(isString, minLength(1), { groups: ['admin'] })
  value!: string;
}

@Recipe
class OneTransformDto {
  @Field(isString, {
    transform: {
      deserialize: ({ value }) => value,
      serialize: ({ value }) => value,
    },
  })
  value!: string;
}

@Recipe
class TwoTransformDto {
  @Field(isString, {
    transform: [
      { deserialize: ({ value }) => value, serialize: ({ value }) => value },
      { deserialize: ({ value }) => value, serialize: ({ value }) => value },
    ],
  })
  value!: string;
}

seal();
deserialize(PlainDto, { value: 'x' });
deserialize(GroupDto, { value: 'x' }, { groups: ['admin'] });
deserialize(OneTransformDto, { value: 'x' });
deserialize(TwoTransformDto, { value: 'x' });

const serOne = Object.assign(new OneTransformDto(), { value: 'x' });
const serTwo = Object.assign(new TwoTransformDto(), { value: 'x' });

let sink: unknown;

group('proof — optimization candidates', () => {
  bench('deserialize plain field', () => {
    sink = deserialize(PlainDto, { value: 'x' });
  });

  bench('deserialize grouped field with groups', () => {
    sink = deserialize(GroupDto, { value: 'x' }, { groups: ['admin'] });
  });

  bench('deserialize one sync transform', () => {
    sink = deserialize(OneTransformDto, { value: 'x' });
  });

  bench('deserialize two sync transforms', () => {
    sink = deserialize(TwoTransformDto, { value: 'x' });
  });

  bench('serialize one sync transform', () => {
    sink = serialize(serOne);
  });

  bench('serialize two sync transforms', () => {
    sink = serialize(serTwo);
  });
});

await run();

// Force tsc to treat 'sink' as used (it's a DCE-prevention write-only target).
void sink;
