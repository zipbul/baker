import { bench, group, run } from 'mitata';

import { Baker, Field } from '../index';
import { isString, minLength } from '../src/rules/index';

const baker = new Baker();

@baker.Recipe
class PlainDto {
  @Field(isString, minLength(1))
  value!: string;
}

@baker.Recipe
class GroupDto {
  @Field(isString, minLength(1), { groups: ['admin'] })
  value!: string;
}

@baker.Recipe
class OneTransformDto {
  @Field(isString, {
    transform: {
      deserialize: ({ value }) => value,
      serialize: ({ value }) => value,
    },
  })
  value!: string;
}

@baker.Recipe
class TwoTransformDto {
  @Field(isString, {
    transform: [
      { deserialize: ({ value }) => value, serialize: ({ value }) => value },
      { deserialize: ({ value }) => value, serialize: ({ value }) => value },
    ],
  })
  value!: string;
}

baker.seal();
baker.deserialize(PlainDto, { value: 'x' });
baker.deserialize(GroupDto, { value: 'x' }, { groups: ['admin'] });
baker.deserialize(OneTransformDto, { value: 'x' });
baker.deserialize(TwoTransformDto, { value: 'x' });

const serOne = Object.assign(new OneTransformDto(), { value: 'x' });
const serTwo = Object.assign(new TwoTransformDto(), { value: 'x' });

let sink: unknown;

group('proof — optimization candidates', () => {
  bench('deserialize plain field', () => {
    sink = baker.deserialize(PlainDto, { value: 'x' });
  });

  bench('deserialize grouped field with groups', () => {
    sink = baker.deserialize(GroupDto, { value: 'x' }, { groups: ['admin'] });
  });

  bench('deserialize one sync transform', () => {
    sink = baker.deserialize(OneTransformDto, { value: 'x' });
  });

  bench('deserialize two sync transforms', () => {
    sink = baker.deserialize(TwoTransformDto, { value: 'x' });
  });

  bench('serialize one sync transform', () => {
    sink = baker.serialize(serOne);
  });

  bench('serialize two sync transforms', () => {
    sink = baker.serialize(serTwo);
  });
});

await run();

// Force tsc to treat 'sink' as used (it's a DCE-prevention write-only target).
void sink;
