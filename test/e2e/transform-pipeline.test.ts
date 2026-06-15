import { describe, it, expect, beforeEach, afterEach } from 'bun:test';

import { Baker, isBakerIssueSet, Field } from '../../index';
import { isString, minLength, maxLength, matches } from '../../src/rules/index';
import { assertBakerIssueSet } from '../integration/helpers/assert';
import { sealClass } from '../integration/helpers/seal';
import { unseal } from '../integration/helpers/unseal';

const baker = new Baker();

beforeEach(() => baker.seal());
afterEach(() => unseal());

const passthrough = ({ value }: { value: unknown }): unknown => value;
const stringTo42Async = async ({ value }: { value: unknown }): Promise<unknown> => {
  if (typeof value === 'string') {
    return 42;
  }
  return value;
};
const emptyToNull = ({ value }: { value: unknown }): unknown => {
  if (value === 'EMPTY') {
    return null;
  }
  return value;
};
const upperIfString = ({ value }: { value: unknown }): unknown => {
  if (typeof value === 'string') {
    return value.toUpperCase();
  }
  return value;
};

// ─────────────────────────────────────────────────────────────────────────────

@baker.Recipe
class TrimLowerDto {
  @Field(isString, {
    transform: {
      deserialize: ({ value }) => {
        let v = typeof value === 'string' ? value.trim() : value;
        v = typeof v === 'string' ? v.toLowerCase() : v;
        return v;
      },
      serialize: ({ value }) => {
        let v = typeof value === 'string' ? value.trim() : value;
        v = typeof v === 'string' ? v.toLowerCase() : v;
        return v;
      },
    },
  })
  email!: string;
}

@baker.Recipe
class DirectionTransformDto {
  @Field(isString, {
    transform: {
      deserialize: ({ value }) => (value as string).trim(),
      serialize: ({ value }) => `<${value}>`,
    },
  })
  tag!: string;
}

@baker.Recipe
class TypeAwareDto {
  @Field(isString, {
    transform: {
      deserialize: ({ value }) => (value as string).toUpperCase(),
      serialize: ({ value }) => (value as string).toLowerCase(),
    },
  })
  code!: string;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('@Transform — stacking', () => {
  it('multiple Transforms applied in order (trim → lower)', async () => {
    const result = (await baker.deserialize(TrimLowerDto, { email: '  FOO@BAR.COM  ' })) as TrimLowerDto;
    expect(result.email).toBe('foo@bar.com');
  });
});

describe('@Transform — direction', () => {
  it('deserializeOnly → applied only during deserialize', async () => {
    const result = (await baker.deserialize(DirectionTransformDto, { tag: '  hello  ' })) as DirectionTransformDto;
    expect(result.tag).toBe('hello');
  });

  it('serializeOnly → applied only during serialize', async () => {
    const dto = Object.assign(new DirectionTransformDto(), { tag: 'world' });
    const result = await baker.serialize(dto);
    expect(result['tag']).toBe('<world>');
  });

  it('direction differentiated via type param', async () => {
    const desResult = (await baker.deserialize(TypeAwareDto, { code: 'abc' })) as TypeAwareDto;
    expect(desResult.code).toBe('ABC');

    const dto = Object.assign(new TypeAwareDto(), { code: 'XYZ' });
    const serResult = await baker.serialize(dto);
    expect(serResult['code']).toBe('xyz');
  });
});

describe('@Transform — stacking serialize', () => {
  it('multiple Transform serialize direction chaining', async () => {
    const dto = Object.assign(new TrimLowerDto(), { email: 'test@example.com' });
    const result = await baker.serialize(dto);
    // bidirectional Transform → applied on serialize too (trim → lower order)
    expect(result['email']).toBe('test@example.com');
  });
});

// ─── @Transform additional edge cases ────────────────────────────────────────

describe('@Transform callback parameters', () => {
  @baker.Recipe
  class CallbackDto {
    @Field(isString, {
      transform: {
        deserialize: ({ value, key, obj }) => `${key}:${obj.prefix}:${value}`,
        serialize: ({ value, key, obj }) => `${key}:${obj.prefix}:${value}`,
      },
    })
    data!: string;

    @Field(isString)
    prefix!: string;
  }

  it('key, obj parameter access', async () => {
    const r = (await baker.deserialize(CallbackDto, { data: 'hello', prefix: 'PRE' })) as CallbackDto;
    expect(r.data).toBe('data:PRE:hello');
  });
});

// ─── E-24: async transform failure error path ──────────────────────────────

describe('E-24: async transform failure error path', () => {
  it('async transform returns invalid value → subsequent validation error has correct path/code', async () => {
    class AsyncInvalidDto {
      @Field(isString, {
        transform: {
          deserialize: stringTo42Async,
          serialize: passthrough,
        },
      })
      name!: string;
    }
    const asyncInvalidBaker = sealClass(AsyncInvalidDto);
    const result = await asyncInvalidBaker.deserialize(AsyncInvalidDto, { name: 'hello' });
    assertBakerIssueSet(result);
    const err = result.errors.find(x => x.code === 'isString');
    expect(err).toBeDefined();
    expect(err!.path).toBe('name');
  });

  it('async transform throws → error propagated', async () => {
    class AsyncThrowDto {
      @Field(isString, {
        transform: {
          deserialize: async () => {
            throw new Error('transform boom');
          },
          serialize: ({ value }) => value,
        },
      })
      value!: string;
    }
    const asyncThrowBaker = sealClass(AsyncThrowDto);
    await expect(asyncThrowBaker.deserialize(AsyncThrowDto, { value: 'test' })).rejects.toThrow('transform boom');
  });
});

describe('@Transform null return behavior', () => {
  // Key point: guard (Optional/Nullable) runs against the original input
  // Transform runs after guard → even if Transform returns null, guard has already passed
  // Therefore if Transform returns null, the subsequent type check will fail

  it('Transform → null return causes isString failure (guard runs on original input)', async () => {
    class NullTransformDto {
      @Field(isString, {
        transform: {
          deserialize: emptyToNull,
          serialize: passthrough,
        },
      })
      v!: string;
    }
    const nullTransformBaker = sealClass(NullTransformDto);
    // original 'EMPTY' is a string → guard passes → Transform → null → isString fails
    expect(isBakerIssueSet(await nullTransformBaker.deserialize(NullTransformDto, { v: 'EMPTY' }))).toBe(true);
  });

  it('Transform returning valid value → validation passes', async () => {
    class TransformDto {
      @Field(isString, {
        transform: {
          deserialize: upperIfString,
          serialize: upperIfString,
        },
      })
      v!: string;
    }
    const transformBaker = sealClass(TransformDto);
    const r = (await transformBaker.deserialize(TransformDto, { v: 'hello' })) as TransformDto;
    expect(r.v).toBe('HELLO');
  });

  it('original is null + nullable → guard skips null → Transform not executed', async () => {
    class NullableDto {
      @Field(isString, {
        nullable: true,
        transform: {
          deserialize: () => 'transformed',
          serialize: () => 'transformed',
        },
      })
      v!: string | null;
    }
    const nullableBaker = sealClass(NullableDto);
    const r = (await nullableBaker.deserialize(NullableDto, { v: null })) as NullableDto;
    // null is skipped by nullable guard → Transform/validation both skipped
    expect(r.v).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Field with 3+ rules + 3-step chained transform array
// ─────────────────────────────────────────────────────────────────────────────

describe('field with 3+ rules and 3+ transforms (codec stack)', () => {
  @baker.Recipe
  class TripleDto {
    @Field(isString, minLength(2), maxLength(20), matches(/^[a-z]+$/), {
      transform: [
        { deserialize: ({ value }) => String(value).trim(), serialize: ({ value }) => value },
        { deserialize: ({ value }) => String(value).toLowerCase(), serialize: ({ value }) => value },
        { deserialize: ({ value }) => String(value).replace(/\s+/g, ''), serialize: ({ value }) => value },
      ],
    })
    name!: string;
  }

  it('three rules + three transforms applied in deserialize order', async () => {
    const r = (await baker.deserialize<TripleDto>(TripleDto, { name: '  Hello World  ' })) as TripleDto;
    expect(r.name).toBe('helloworld');
  });

  it('failing rule still surfaces error after transforms', async () => {
    const r = await baker.deserialize(TripleDto, { name: '  H1  ' });
    expect(isBakerIssueSet(r)).toBe(true);
  });
});
