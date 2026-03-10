import { describe, it, expect } from 'bun:test';
import { deserialize, toJsonSchema, BakerValidationError, Field } from '../../index';
import { isNotEmptyObject, isObject } from '../../src/rules/index';

// ─────────────────────────────────────────────────────────────────────────────

class EmptyObjDto {
  @Field(isNotEmptyObject())
  config!: Record<string, unknown>;
}

class ObjDto {
  @Field(isObject)
  data!: object;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('isNotEmptyObject', () => {
  it('키가 있는 객체 통과', async () => {
    const r = await deserialize<EmptyObjDto>(EmptyObjDto, { config: { a: 1 } });
    expect(r.config).toEqual({ a: 1 });
  });

  it('빈 객체 거부', async () => {
    await expect(
      deserialize(EmptyObjDto, { config: {} }),
    ).rejects.toThrow(BakerValidationError);
  });

  it('toJsonSchema → minProperties: 1', () => {
    const schema = toJsonSchema(EmptyObjDto);
    expect(schema.properties!.config!.minProperties).toBe(1);
  });

  it('nullable 옵션 — null 값 키 무시', async () => {
    class NullableObjDto {
      @Field(isNotEmptyObject({ nullable: true }))
      config!: Record<string, unknown>;
    }
    // 모든 값이 null → 빈 객체로 간주
    await expect(
      deserialize(NullableObjDto, { config: { a: null, b: undefined } }),
    ).rejects.toThrow(BakerValidationError);
    // non-null 값 존재 → 통과
    const r = await deserialize<NullableObjDto>(NullableObjDto, { config: { a: null, b: 1 } });
    expect(r.config.b).toBe(1);
  });
});

describe('isObject', () => {
  it('객체 통과', async () => {
    const r = await deserialize<ObjDto>(ObjDto, { data: { key: 'val' } });
    expect(r.data).toEqual({ key: 'val' });
  });

  it('배열 거부', async () => {
    await expect(
      deserialize(ObjDto, { data: [1, 2] }),
    ).rejects.toThrow(BakerValidationError);
  });

  it('null 거부', async () => {
    await expect(
      deserialize(ObjDto, { data: null }),
    ).rejects.toThrow(BakerValidationError);
  });
});
