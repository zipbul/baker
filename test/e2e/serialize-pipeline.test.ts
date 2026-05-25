import { describe, it, expect, afterEach, beforeEach } from 'bun:test';

import { serialize, deserialize, Field, Recipe, seal } from '../../index';
import { isString, isNumber } from '../../src/rules/index';
import { sealClass } from '../integration/helpers/seal';
import { unseal, purgePoisonClasses } from '../integration/helpers/unseal';

beforeEach(() => seal());
afterEach(() => unseal());
// ─────────────────────────────────────────────────────────────────────────────

@Recipe
class NameMappedDto {
  @Field(isString, { name: 'full_name' })
  name!: string;

  @Field(isNumber())
  age!: number;
}

@Recipe
class ExcludeSerDto {
  @Field(isString)
  visible!: string;

  @Field(isString, { exclude: true })
  hidden!: string;
}

@Recipe
class SerOnlyTransformDto {
  @Field(isNumber(), {
    transform: { deserialize: ({ value }) => value, serialize: ({ value }) => (value as number) * 100 },
  })
  price!: number;
}

@Recipe
class DeserOnlyTransformDto {
  @Field(isString, {
    transform: { deserialize: ({ value }) => (value as string).trim(), serialize: ({ value }) => value },
  })
  tag!: string;
}

@Recipe
class DirectionExposeDto {
  @Field(isString, { deserializeName: 'user_name', serializeName: 'userName' })
  name!: string;
}

@Recipe
class PipelineDto {
  @Field(isString, {
    serializeName: 'display_name',
    transform: { deserialize: ({ value }) => value, serialize: ({ value }) => `[${value}]` },
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
    const result = (await deserialize<SerOnlyTransformDto>(SerOnlyTransformDto, { price: 9 })) as SerOnlyTransformDto;
    expect(result.price).toBe(9);
  });

  it('deserializeOnly → not applied on serialize', async () => {
    const dto = Object.assign(new DeserOnlyTransformDto(), { tag: '  hello  ' });
    const result = await serialize(dto);
    expect(result['tag']).toBe('  hello  ');
  });

  it('deserializeOnly → applied on deserialize', async () => {
    const result = (await deserialize<DeserOnlyTransformDto>(DeserOnlyTransformDto, {
      tag: '  hello  ',
    })) as DeserOnlyTransformDto;
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
    const result = (await deserialize<DirectionExposeDto>(DirectionExposeDto, { user_name: 'Carol' })) as DirectionExposeDto;
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

@Recipe
class ChildDto {
  @Field(isString)
  label!: string;
}

@Recipe
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
    expect((result.children as unknown[])[0]).toEqual({ label: 'first' });
    expect((result.children as unknown[])[1]).toBeNull();
    expect((result.children as unknown[])[2]).toEqual({ label: 'third' });
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

// ─────────────────────────────────────────────────────────────────────────────
// Forged-instance rejection (a real instance is `instanceof` its class; a forged
// `{ constructor: Dto }` plain object is not, and must be rejected).
// ─────────────────────────────────────────────────────────────────────────────

@Recipe
class ForgeTarget {
  @Field(isString) name!: string;
}

describe('serialize — forged instance rejection', () => {
  it('rejects a plain object whose constructor is forged to point at a sealed DTO', () => {
    const forged = { constructor: ForgeTarget, name: 'x' };
    expect(() => serialize(forged as never)).toThrow(/plain object/);
  });

  it('still serializes a genuine instance of the same class', () => {
    const real = deserialize(ForgeTarget, { name: 'ok' }) as ForgeTarget;
    expect(serialize(real)).toEqual({ name: 'ok' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Prototype-pollution safety: a `__proto__` output key (static expose name or Map key)
// must become an own property, never mutate the output object's prototype.
// ─────────────────────────────────────────────────────────────────────────────

@Recipe
class ProtoMapDto {
  @Field({ type: () => Map }) m!: Map<string, unknown>;
}

describe('serialize — prototype pollution safety', () => {
  afterEach(() => {
    purgePoisonClasses();
    unseal();
  });

  it('rejects a reserved __proto__ expose name at seal', () => {
    expect(() => {
      @Recipe
      class ProtoExposeDto {
        @Field({ name: '__proto__' }) obj!: unknown;
      }
      sealClass(ProtoExposeDto);
    }).toThrow(/reserved property name/);
  });

  it('rejects a reserved constructor expose name at seal', () => {
    expect(() => {
      @Recipe
      class CtorExposeDto {
        @Field({ name: 'constructor' }) v!: unknown;
      }
      sealClass(CtorExposeDto);
    }).toThrow(/reserved property name/);
  });

  it('rejects a reserved prototype expose name at seal', () => {
    expect(() => {
      @Recipe
      class ProtoNameDto {
        @Field({ name: 'prototype' }) v!: unknown;
      }
      sealClass(ProtoNameDto);
    }).toThrow(/reserved property name/);
  });

  it('does not pollute a serialized Map object via a __proto__ key', () => {
    seal();
    const inst = Object.create(ProtoMapDto.prototype) as ProtoMapDto;
    inst.m = new Map<string, unknown>([['__proto__', { polluted: true }]]);
    const out = serialize(inst) as { m: Record<string, unknown> };
    expect(Object.getPrototypeOf(out.m)).toBe(null);
    expect(Object.prototype.hasOwnProperty.call(out.m, '__proto__')).toBe(true);
    expect((out.m as { polluted?: unknown }).polluted).toBeUndefined();
  });
});
