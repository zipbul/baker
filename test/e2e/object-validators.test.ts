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
  it('object with keys passes', async () => {
    const r = await deserialize<EmptyObjDto>(EmptyObjDto, { config: { a: 1 } });
    expect(r.config).toEqual({ a: 1 });
  });

  it('empty object rejected', async () => {
    await expect(
      deserialize(EmptyObjDto, { config: {} }),
    ).rejects.toThrow(BakerValidationError);
  });

  it('toJsonSchema → minProperties: 1', () => {
    const schema = toJsonSchema(EmptyObjDto);
    expect(schema.properties!.config!.minProperties).toBe(1);
  });

  it('nullable option — ignores null-valued keys', async () => {
    class NullableObjDto {
      @Field(isNotEmptyObject({ nullable: true }))
      config!: Record<string, unknown>;
    }
    // all values are null → treated as empty object
    await expect(
      deserialize(NullableObjDto, { config: { a: null, b: undefined } }),
    ).rejects.toThrow(BakerValidationError);
    // non-null value exists → passes
    const r = await deserialize<NullableObjDto>(NullableObjDto, { config: { a: null, b: 1 } });
    expect(r.config.b).toBe(1);
  });
});

describe('isObject', () => {
  it('object passes', async () => {
    const r = await deserialize<ObjDto>(ObjDto, { data: { key: 'val' } });
    expect(r.data).toEqual({ key: 'val' });
  });

  it('array rejected', async () => {
    await expect(
      deserialize(ObjDto, { data: [1, 2] }),
    ).rejects.toThrow(BakerValidationError);
  });

  it('null rejected', async () => {
    await expect(
      deserialize(ObjDto, { data: null }),
    ).rejects.toThrow(BakerValidationError);
  });
});
