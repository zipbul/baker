import { describe, it, expect, afterEach } from 'bun:test';
import { seal, deserialize, toJsonSchema, BakerValidationError, IsNotEmptyObject, IsObject } from '../../index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class EmptyObjDto {
  @IsNotEmptyObject()
  config!: Record<string, unknown>;
}

class ObjDto {
  @IsObject()
  data!: object;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('@IsNotEmptyObject', () => {
  it('키가 있는 객체 통과', async () => {
    seal();
    const r = await deserialize<EmptyObjDto>(EmptyObjDto, { config: { a: 1 } });
    expect(r.config).toEqual({ a: 1 });
  });

  it('빈 객체 거부', async () => {
    seal();
    await expect(
      deserialize(EmptyObjDto, { config: {} }),
    ).rejects.toThrow(BakerValidationError);
  });

  it('toJsonSchema → minProperties: 1', () => {
    const schema = toJsonSchema(EmptyObjDto);
    expect(schema.properties!.config!.minProperties).toBe(1);
  });
});

describe('@IsObject', () => {
  it('객체 통과', async () => {
    seal();
    const r = await deserialize<ObjDto>(ObjDto, { data: { key: 'val' } });
    expect(r.data).toEqual({ key: 'val' });
  });

  it('배열 거부', async () => {
    seal();
    await expect(
      deserialize(ObjDto, { data: [1, 2] }),
    ).rejects.toThrow(BakerValidationError);
  });

  it('null 거부', async () => {
    seal();
    await expect(
      deserialize(ObjDto, { data: null }),
    ).rejects.toThrow(BakerValidationError);
  });
});
