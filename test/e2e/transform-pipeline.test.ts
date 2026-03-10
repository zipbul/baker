import { describe, it, expect } from 'bun:test';
import { deserialize, serialize, BakerValidationError, Field } from '../../index';
import { isString } from '../../src/rules/index';
import { Transform } from '../../src/decorators/transform';

// ─────────────────────────────────────────────────────────────────────────────

class TrimLowerDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @Transform(({ value }) => typeof value === 'string' ? value.toLowerCase() : value)
  @Field(isString)
  email!: string;
}

class DirectionTransformDto {
  @Transform(({ value }) => (value as string).trim(), { deserializeOnly: true })
  @Transform(({ value }) => `<${value}>`, { serializeOnly: true })
  @Field(isString)
  tag!: string;
}

class TypeAwareDto {
  @Transform(({ value, type }) =>
    type === 'deserialize' ? (value as string).toUpperCase() : (value as string).toLowerCase(),
  )
  @Field(isString)
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
    @Transform(({ value, key, obj }) => `${key}:${obj.prefix}:${value}`)
    @Field(isString)
    data!: string;

    @Field(isString)
    prefix!: string;
  }

  it('key, obj 파라미터 접근', async () => {
    const r = await deserialize<CallbackDto>(CallbackDto, { data: 'hello', prefix: 'PRE' });
    expect(r.data).toBe('data:PRE:hello');
  });
});

describe('@Transform null 반환 동작', () => {
  // 핵심: guard(Optional/Nullable)는 원본 입력에 대해 실행됨
  // Transform은 guard 이후 실행 → Transform이 null 반환해도 guard는 이미 통과한 상태
  // 따라서 Transform이 null을 반환하면 이후 type check에서 실패함

  it('Transform → null 반환 시 isString 실패 (guard는 원본 입력에서 실행)', async () => {
    class NullTransformDto {
      @Transform(({ value }) => value === 'EMPTY' ? null : value)
      @Field(isString)
      v!: string;
    }
    // 원본 'EMPTY'는 문자열 → guard 통과 → Transform → null → isString 실패
    await expect(deserialize(NullTransformDto, { v: 'EMPTY' })).rejects.toThrow(BakerValidationError);
  });

  it('Transform이 유효값 반환 시 검증 통과', async () => {
    class TransformDto {
      @Transform(({ value }) => typeof value === 'string' ? value.toUpperCase() : value)
      @Field(isString)
      v!: string;
    }
    const r = await deserialize<TransformDto>(TransformDto, { v: 'hello' });
    expect(r.v).toBe('HELLO');
  });

  it('원본이 null + nullable → guard에서 null 스킵 → Transform 실행 안 됨', async () => {
    class NullableDto {
      @Transform(({ value }) => 'transformed')
      @Field(isString, { nullable: true })
      v!: string | null;
    }
    const r = await deserialize<NullableDto>(NullableDto, { v: null });
    // null은 nullable guard에서 스킵 → Transform/검증 모두 스킵
    expect(r.v).toBeNull();
  });
});
