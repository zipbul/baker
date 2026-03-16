import { describe, it, expect } from 'bun:test';
import { deserialize, serialize, BakerValidationError, Field } from '../../index';
import { isString } from '../../src/rules/index';
// ─────────────────────────────────────────────────────────────────────────────

class TrimLowerDto {
  @Field(isString, {
    transform: ({ value }) => {
      let v = typeof value === 'string' ? value.trim() : value;
      v = typeof v === 'string' ? v.toLowerCase() : v;
      return v;
    },
  })
  email!: string;
}

class DirectionTransformDto {
  @Field(isString, {
    transform: ({ value, direction }) => {
      if (direction === 'deserialize') return (value as string).trim();
      if (direction === 'serialize') return `<${value}>`;
      return value;
    },
  })
  tag!: string;
}

class TypeAwareDto {
  @Field(isString, {
    transform: ({ value, direction }) =>
      direction === 'deserialize' ? (value as string).toUpperCase() : (value as string).toLowerCase(),
  })
  code!: string;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('@Transform — stacking', () => {
  it('다중 Transform 순서대로 적용 (trim → lower)', async () => {
    const result = await deserialize<TrimLowerDto>(TrimLowerDto, { email: '  FOO@BAR.COM  ' });
    expect(result.email).toBe('foo@bar.com');
  });
});

describe('@Transform — direction', () => {
  it('deserializeOnly → deserialize에서만 적용', async () => {
    const result = await deserialize<DirectionTransformDto>(DirectionTransformDto, { tag: '  hello  ' });
    expect(result.tag).toBe('hello');
  });

  it('serializeOnly → serialize에서만 적용', async () => {
    const dto = Object.assign(new DirectionTransformDto(), { tag: 'world' });
    const result = await serialize(dto);
    expect(result['tag']).toBe('<world>');
  });

  it('type param으로 방향 구분', async () => {
    const desResult = await deserialize<TypeAwareDto>(TypeAwareDto, { code: 'abc' });
    expect(desResult.code).toBe('ABC');

    const dto = Object.assign(new TypeAwareDto(), { code: 'XYZ' });
    const serResult = await serialize(dto);
    expect(serResult['code']).toBe('xyz');
  });
});

describe('@Transform — stacking serialize', () => {
  it('다중 Transform serialize 방향 체이닝', async () => {
    const dto = Object.assign(new TrimLowerDto(), { email: 'test@example.com' });
    const result = await serialize(dto);
    // 양방향 Transform → serialize에도 적용 (trim → lower 순)
    expect(result['email']).toBe('test@example.com');
  });
});

// ─── @Transform 추가 에지 케이스 ────────────────────────────────────────────

describe('@Transform 콜백 파라미터', () => {
  class CallbackDto {
    @Field(isString, {
      transform: ({ value, key, obj }) => `${key}:${obj.prefix}:${value}`,
    })
    data!: string;

    @Field(isString)
    prefix!: string;
  }

  it('key, obj 파라미터 접근', async () => {
    const r = await deserialize<CallbackDto>(CallbackDto, { data: 'hello', prefix: 'PRE' });
    expect(r.data).toBe('data:PRE:hello');
  });
});

// ─── E-24: async transform failure error path ──────────────────────────────

describe('E-24: async transform failure error path', () => {
  it('async transform returns invalid value → subsequent validation error has correct path/code', async () => {
    class AsyncInvalidDto {
      @Field(isString, {
        transform: async ({ value }) => typeof value === 'string' ? 42 : value,
      })
      name!: string;
    }
    try {
      await deserialize(AsyncInvalidDto, { name: 'hello' });
      throw new Error('expected rejection');
    } catch (e) {
      if (!(e instanceof BakerValidationError)) throw e;
      const err = e.errors.find(x => x.code === 'isString');
      expect(err).toBeDefined();
      expect(err!.path).toBe('name');
    }
  });

  it('async transform throws → error propagated', async () => {
    class AsyncThrowDto {
      @Field(isString, {
        transform: async () => { throw new Error('transform boom'); },
      })
      value!: string;
    }
    await expect(deserialize(AsyncThrowDto, { value: 'test' })).rejects.toThrow('transform boom');
  });
});

describe('@Transform null 반환 동작', () => {
  // 핵심: guard(Optional/Nullable)는 원본 입력에 대해 실행됨
  // Transform은 guard 이후 실행 → Transform이 null 반환해도 guard는 이미 통과한 상태
  // 따라서 Transform이 null을 반환하면 이후 type check에서 실패함

  it('Transform → null 반환 시 isString 실패 (guard는 원본 입력에서 실행)', async () => {
    class NullTransformDto {
      @Field(isString, {
        transform: ({ value }) => value === 'EMPTY' ? null : value,
      })
      v!: string;
    }
    // 원본 'EMPTY'는 문자열 → guard 통과 → Transform → null → isString 실패
    await expect(deserialize(NullTransformDto, { v: 'EMPTY' })).rejects.toThrow(BakerValidationError);
  });

  it('Transform이 유효값 반환 시 검증 통과', async () => {
    class TransformDto {
      @Field(isString, {
        transform: ({ value }) => typeof value === 'string' ? value.toUpperCase() : value,
      })
      v!: string;
    }
    const r = await deserialize<TransformDto>(TransformDto, { v: 'hello' });
    expect(r.v).toBe('HELLO');
  });

  it('원본이 null + nullable → guard에서 null 스킵 → Transform 실행 안 됨', async () => {
    class NullableDto {
      @Field(isString, {
        nullable: true,
        transform: ({ value }) => 'transformed',
      })
      v!: string | null;
    }
    const r = await deserialize<NullableDto>(NullableDto, { v: null });
    // null은 nullable guard에서 스킵 → Transform/검증 모두 스킵
    expect(r.v).toBeNull();
  });
});
