import { describe, it, expect, afterEach } from 'bun:test';
import { Field, deserialize, toJsonSchema, BakerValidationError } from '../../index';
import { isNumber, min, max } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class ExclusiveDto {
  @Field(isNumber(), min(0, { exclusive: true }), max(100, { exclusive: true }))
  score!: number;
}

class InclusiveDto {
  @Field(isNumber(), min(0), max(100))
  value!: number;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('@Min/@Max exclusive', () => {
  it('exclusive — boundary values exactly rejected', async () => {
    await expect(deserialize(ExclusiveDto, { score: 0 })).rejects.toThrow(BakerValidationError);
    await expect(deserialize(ExclusiveDto, { score: 100 })).rejects.toThrow(BakerValidationError);
  });

  it('exclusive — just inside boundary passes', async () => {
    const r1 = await deserialize<ExclusiveDto>(ExclusiveDto, { score: 0.001 });
    expect(r1.score).toBe(0.001);
    const r2 = await deserialize<ExclusiveDto>(ExclusiveDto, { score: 99.999 });
    expect(r2.score).toBe(99.999);
  });

  it('inclusive — boundary values included', async () => {
    const r1 = await deserialize<InclusiveDto>(InclusiveDto, { value: 0 });
    expect(r1.value).toBe(0);
    const r2 = await deserialize<InclusiveDto>(InclusiveDto, { value: 100 });
    expect(r2.value).toBe(100);
  });

  it('inclusive — out of range rejected', async () => {
    await expect(deserialize(InclusiveDto, { value: -1 })).rejects.toThrow(BakerValidationError);
    await expect(deserialize(InclusiveDto, { value: 101 })).rejects.toThrow(BakerValidationError);
  });
});

describe('@Min/@Max exclusive toJsonSchema', () => {
  it('exclusive → exclusiveMinimum / exclusiveMaximum', () => {
    const schema = toJsonSchema(ExclusiveDto);
    expect(schema.properties!.score).toEqual({
      type: 'number',
      exclusiveMinimum: 0,
      exclusiveMaximum: 100,
    });
  });

  it('inclusive → minimum / maximum', () => {
    const schema = toJsonSchema(InclusiveDto);
    expect(schema.properties!.value).toEqual({
      type: 'number',
      minimum: 0,
      maximum: 100,
    });
  });

  it('mixed — only one side exclusive', () => {
    class MixedDto {
      @Field(isNumber(), min(0, { exclusive: true }), max(100))
      val!: number;
    }
    const schema = toJsonSchema(MixedDto);
    expect(schema.properties!.val).toEqual({
      type: 'number',
      exclusiveMinimum: 0,
      maximum: 100,
    });
  });
});
