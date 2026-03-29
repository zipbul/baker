import { describe, it, expect } from 'bun:test';
import { deserialize, toJsonSchema, isBakerError, Field } from '../../index';
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
    const r = await deserialize(EmptyObjDto, { config: { a: 1 } }) as EmptyObjDto;
    expect(r.config).toEqual({ a: 1 });
  });

  it('empty object rejected', async () => {
    expect(isBakerError(await deserialize(EmptyObjDto, { config: {} }))).toBe(true);
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
    expect(isBakerError(await deserialize(NullableObjDto, { config: { a: null, b: undefined } }))).toBe(true);
    // non-null value exists → passes
    const r = await deserialize(NullableObjDto, { config: { a: null, b: 1 } }) as NullableObjDto;
    expect(r.config.b).toBe(1);
  });
});

describe('isObject', () => {
  it('object passes', async () => {
    const r = await deserialize(ObjDto, { data: { key: 'val' } }) as ObjDto;
    expect(r.data).toEqual({ key: 'val' });
  });

  it('array rejected', async () => {
    expect(isBakerError(await deserialize(ObjDto, { data: [1, 2] }))).toBe(true);
  });

  it('null rejected', async () => {
    expect(isBakerError(await deserialize(ObjDto, { data: null }))).toBe(true);
  });
});
