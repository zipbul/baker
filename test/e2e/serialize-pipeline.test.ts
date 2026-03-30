import { describe, it, expect, afterEach } from 'bun:test';
import { serialize, deserialize, Field } from '../../index';
import { isString, isNumber } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());
// ─────────────────────────────────────────────────────────────────────────────

class NameMappedDto {
  @Field(isString, { name: 'full_name' })
  name!: string;

  @Field(isNumber())
  age!: number;
}

class ExcludeSerDto {
  @Field(isString)
  visible!: string;

  @Field(isString, { exclude: true })
  hidden!: string;
}

class SerOnlyTransformDto {
  @Field(isNumber(), {
    transform: ({ value }) => (value as number) * 100,
    transformDirection: 'serializeOnly',
  })
  price!: number;
}

class DeserOnlyTransformDto {
  @Field(isString, {
    transform: ({ value }) => (value as string).trim(),
    transformDirection: 'deserializeOnly',
  })
  tag!: string;
}

class DirectionExposeDto {
  @Field(isString, { deserializeName: 'user_name', serializeName: 'userName' })
  name!: string;
}

class PipelineDto {
  @Field(isString, {
    serializeName: 'display_name',
    transform: ({ value }) => `[${value}]`,
    transformDirection: 'serializeOnly',
  })
  name!: string;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('serialize pipeline — @Field({ name })', () => {
  it('serialize outputs mapped key', async () => {
    const dto = Object.assign(new NameMappedDto(), { name: 'Alice', age: 25 });
    const result = await serialize(dto);
    expect(result['full_name']).toBe('Alice');
    expect(result['name']).toBeUndefined();
    expect(result['age']).toBe(25);
  });
});

describe('serialize pipeline — @Exclude', () => {
  it('Exclude field excluded', async () => {
    const dto = Object.assign(new ExcludeSerDto(), { visible: 'yes', hidden: 'no' });
    const result = await serialize(dto);
    expect(result['visible']).toBe('yes');
    expect(result['hidden']).toBeUndefined();
  });
});

describe('serialize pipeline — @Transform direction', () => {
  it('serializeOnly → applied only on serialize', async () => {
    const dto = Object.assign(new SerOnlyTransformDto(), { price: 9 });
    const result = await serialize(dto);
    expect(result['price']).toBe(900);
  });

  it('serializeOnly → not applied on deserialize', async () => {
    const result = await deserialize<SerOnlyTransformDto>(SerOnlyTransformDto, { price: 9 }) as SerOnlyTransformDto;
    expect(result.price).toBe(9);
  });

  it('deserializeOnly → not applied on serialize', async () => {
    const dto = Object.assign(new DeserOnlyTransformDto(), { tag: '  hello  ' });
    const result = await serialize(dto);
    expect(result['tag']).toBe('  hello  ');
  });

  it('deserializeOnly → applied on deserialize', async () => {
    const result = await deserialize<DeserOnlyTransformDto>(DeserOnlyTransformDto, { tag: '  hello  ' }) as DeserOnlyTransformDto;
    expect(result.tag).toBe('hello');
  });
});

describe('serialize pipeline — direction @Expose', () => {
  it('serialize → serializeOnly @Expose name used', async () => {
    const dto = Object.assign(new DirectionExposeDto(), { name: 'Bob' });
    const result = await serialize(dto);
    expect(result['userName']).toBe('Bob');
    expect(result['user_name']).toBeUndefined();
  });

  it('deserialize → deserializeOnly @Expose name used', async () => {
    const result = await deserialize<DirectionExposeDto>(DirectionExposeDto, { user_name: 'Carol' }) as DirectionExposeDto;
    expect(result.name).toBe('Carol');
  });
});

describe('serialize pipeline — @Expose + @Transform combination', () => {
  it('serialize: Transform applied then output with mapped key', async () => {
    const dto = Object.assign(new PipelineDto(), { name: 'Dave' });
    const result = await serialize(dto);
    expect(result['display_name']).toBe('[Dave]');
    expect(result['name']).toBeUndefined();
  });
});

// ─── E-19: nested array null element serialize ──────────────────────────────

class ChildDto {
  @Field(isString)
  label!: string;
}

class ParentWithArrayDto {
  @Field(isString)
  name!: string;

  @Field({ type: () => [ChildDto] })
  children!: (ChildDto | null)[];
}

describe('E-19: nested array with null elements — serialize', () => {
  it('array with [child, null, child] → serialize returns [serialized, null, serialized]', async () => {
    const child1 = Object.assign(new ChildDto(), { label: 'first' });
    const child3 = Object.assign(new ChildDto(), { label: 'third' });
    const parent = Object.assign(new ParentWithArrayDto(), {
      name: 'Alice',
      children: [child1, null, child3],
    });

    const result = await serialize(parent);
    expect(result.name).toBe('Alice');
    expect(result.children).toHaveLength(3);
    expect((result.children as any[])[0]).toEqual({ label: 'first' });
    expect((result.children as any[])[1]).toBeNull();
    expect((result.children as any[])[2]).toEqual({ label: 'third' });
  });

  it('array with all null elements → serialize returns [null, null]', async () => {
    const parent = Object.assign(new ParentWithArrayDto(), {
      name: 'Bob',
      children: [null, null],
    });

    const result = await serialize(parent);
    expect(result.children).toEqual([null, null]);
  });
});
