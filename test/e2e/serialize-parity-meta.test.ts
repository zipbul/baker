import { afterEach, describe, expect, it } from 'bun:test';
import { deserialize, Field, serialize } from '../../index';
import {
  isNumber,
  isString,
} from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

class ChildDto {
  @Field(isString)
  name!: string;
}

class CatDto {
  @Field(isString)
  breed!: string;
}

class DogDto {
  @Field(isString)
  color!: string;
}

class ComplexSerializeDto {
  @Field(isString, {
    serializeName: 'display_name',
    transform: {
      deserialize: ({ value }) => value,
      serialize: ({ value }) => String(value).trim().toUpperCase(),
    },
  })
  name!: string;

  @Field(isNumber(), {
    exclude: 'deserializeOnly',
  })
  version!: number;

  @Field({ type: () => [ChildDto] })
  children!: (ChildDto | null)[];

  @Field({ type: () => Set as any, setValue: () => ChildDto })
  tags!: Set<ChildDto | null>;

  @Field({ type: () => Map as any, mapValue: () => ChildDto })
  lookup!: Map<string, ChildDto | null>;

  @Field({
    groups: ['admin'],
    type: () => CatDto,
    discriminator: {
      property: 'kind',
      subTypes: [
        { name: 'cat', value: CatDto },
        { name: 'dog', value: DogDto },
      ],
    },
  })
  pet!: CatDto | DogDto;
}

describe('serialize parity meta', () => {
  it('applies mapping, transforms, nested arrays, Set, Map, and discriminator together', async () => {
    const childA = Object.assign(new ChildDto(), { name: 'alpha' });
    const childB = Object.assign(new ChildDto(), { name: 'beta' });
    const pet = Object.assign(new DogDto(), { color: 'black' });

    const dto = Object.assign(new ComplexSerializeDto(), {
      name: '  alice  ',
      version: 3,
      children: [childA, null, childB],
      tags: new Set([childA, null]),
      lookup: new Map([
        ['first', childA],
        ['second', null],
      ]),
      pet,
    });

    const publicResult = await serialize(dto);
    expect(publicResult.display_name).toBe('ALICE');
    expect(publicResult.version).toBe(3);
    expect(publicResult.children).toEqual([{ name: 'alpha' }, null, { name: 'beta' }]);
    expect(publicResult.tags).toEqual([{ name: 'alpha' }, null]);
    expect(publicResult.lookup).toEqual({ first: { name: 'alpha' }, second: null });
    expect(publicResult.pet).toBeUndefined();

    const adminResult = await serialize(dto, { groups: ['admin'] });
    expect(adminResult.pet).toEqual({ color: 'black', kind: 'dog' });
  });

  it('roundtrips directional names and serialize output contract together', async () => {
    class RoundtripDto {
      @Field(isString, {
        deserializeName: 'full_name',
        serializeName: 'fullName',
        transform: {
          deserialize: ({ value }) => String(value).trim(),
          serialize: ({ value }) => `[${value}]`,
        },
      })
      name!: string;

      @Field({ type: () => ChildDto, optional: true })
      child?: ChildDto;
    }

    const parsed = await deserialize<RoundtripDto>(RoundtripDto, {
      full_name: '  Carol  ',
      child: { name: 'Neo' },
    }) as RoundtripDto;

    const output = await serialize(parsed);
    expect(output).toEqual({
      fullName: '[Carol]',
      child: { name: 'Neo' },
    });
  });
});
