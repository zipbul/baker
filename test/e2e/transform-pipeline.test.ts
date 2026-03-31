import { describe, it, expect } from 'bun:test';
import { deserialize, serialize, isBakerError, Field } from '../../index';
import { isString } from '../../src/rules/index';
// ─────────────────────────────────────────────────────────────────────────────

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

class DirectionTransformDto {
  @Field(isString, {
    transform: {
      deserialize: ({ value }) => (value as string).trim(),
      serialize: ({ value }) => `<${value}>`,
    },
  })
  tag!: string;
}

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
    const result = await deserialize(TrimLowerDto, { email: '  FOO@BAR.COM  ' }) as TrimLowerDto;
    expect(result.email).toBe('foo@bar.com');
  });
});

describe('@Transform — direction', () => {
  it('deserializeOnly → applied only during deserialize', async () => {
    const result = await deserialize(DirectionTransformDto, { tag: '  hello  ' }) as DirectionTransformDto;
    expect(result.tag).toBe('hello');
  });

  it('serializeOnly → applied only during serialize', async () => {
    const dto = Object.assign(new DirectionTransformDto(), { tag: 'world' });
    const result = await serialize(dto);
    expect(result['tag']).toBe('<world>');
  });

  it('direction differentiated via type param', async () => {
    const desResult = await deserialize(TypeAwareDto, { code: 'abc' }) as TypeAwareDto;
    expect(desResult.code).toBe('ABC');

    const dto = Object.assign(new TypeAwareDto(), { code: 'XYZ' });
    const serResult = await serialize(dto);
    expect(serResult['code']).toBe('xyz');
  });
});

describe('@Transform — stacking serialize', () => {
  it('multiple Transform serialize direction chaining', async () => {
    const dto = Object.assign(new TrimLowerDto(), { email: 'test@example.com' });
    const result = await serialize(dto);
    // bidirectional Transform → applied on serialize too (trim → lower order)
    expect(result['email']).toBe('test@example.com');
  });
});

// ─── @Transform additional edge cases ────────────────────────────────────────

describe('@Transform callback parameters', () => {
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
    const r = await deserialize(CallbackDto, { data: 'hello', prefix: 'PRE' }) as CallbackDto;
    expect(r.data).toBe('data:PRE:hello');
  });
});

// ─── E-24: async transform failure error path ──────────────────────────────

describe('E-24: async transform failure error path', () => {
  it('async transform returns invalid value → subsequent validation error has correct path/code', async () => {
    class AsyncInvalidDto {
      @Field(isString, {
        transform: {
          deserialize: async ({ value }) => typeof value === 'string' ? 42 : value,
          serialize: ({ value }) => value,
        },
      })
      name!: string;
    }
    const result = await deserialize(AsyncInvalidDto, { name: 'hello' });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      const err = result.errors.find(x => x.code === 'isString');
      expect(err).toBeDefined();
      expect(err!.path).toBe('name');
    }
  });

  it('async transform throws → error propagated', async () => {
    class AsyncThrowDto {
      @Field(isString, {
        transform: {
          deserialize: async () => { throw new Error('transform boom'); },
          serialize: ({ value }) => value,
        },
      })
      value!: string;
    }
    await expect(deserialize(AsyncThrowDto, { value: 'test' })).rejects.toThrow('transform boom');
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
          deserialize: ({ value }) => value === 'EMPTY' ? null : value,
          serialize: ({ value }) => value,
        },
      })
      v!: string;
    }
    // original 'EMPTY' is a string → guard passes → Transform → null → isString fails
    expect(isBakerError(await deserialize(NullTransformDto, { v: 'EMPTY' }))).toBe(true);
  });

  it('Transform returning valid value → validation passes', async () => {
    class TransformDto {
      @Field(isString, {
        transform: {
          deserialize: ({ value }) => typeof value === 'string' ? value.toUpperCase() : value,
          serialize: ({ value }) => typeof value === 'string' ? value.toUpperCase() : value,
        },
      })
      v!: string;
    }
    const r = await deserialize(TransformDto, { v: 'hello' }) as TransformDto;
    expect(r.v).toBe('HELLO');
  });

  it('original is null + nullable → guard skips null → Transform not executed', async () => {
    class NullableDto {
      @Field(isString, {
        nullable: true,
        transform: {
          deserialize: ({ value }) => 'transformed',
          serialize: ({ value }) => 'transformed',
        },
      })
      v!: string | null;
    }
    const r = await deserialize(NullableDto, { v: null }) as NullableDto;
    // null is skipped by nullable guard → Transform/validation both skipped
    expect(r.v).toBeNull();
  });
});
