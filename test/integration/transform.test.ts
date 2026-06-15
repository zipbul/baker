import { describe, it, expect, beforeEach } from 'bun:test';

import { Baker, Field } from '../../index';
import { isString, isNumber } from '../../src/rules/index';

const baker = new Baker();

// ─── DTOs ────────────────────────────────────────────────────────────────────

@baker.Recipe
class TrimmedDto {
  @Field(isString, {
    transform: {
      deserialize: ({ value }) => (typeof value === 'string' ? value.trim() : value),
      serialize: ({ value }) => value,
    },
  })
  name!: string;
}

@baker.Recipe
class ToUpperDto {
  @Field(isString, {
    transform: {
      deserialize: ({ value }) => (typeof value === 'string' ? value.toUpperCase() : value),
      serialize: ({ value }) => value,
    },
  })
  code!: string;
}

@baker.Recipe
class SerializeTransformDto {
  @Field(isNumber(), {
    transform: { deserialize: ({ value }) => value, serialize: ({ value }) => (typeof value === 'number' ? value * 100 : value) },
  })
  price!: number;
}

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => baker.seal());

describe('transform — integration', () => {
  it('should apply transform function during deserialization', async () => {
    const result = (await baker.deserialize<TrimmedDto>(TrimmedDto, { name: '  Alice  ' })) as TrimmedDto;
    expect(result.name).toBe('Alice');
  });

  it('should apply uppercase transform during deserialization', async () => {
    const result = (await baker.deserialize<ToUpperDto>(ToUpperDto, { code: 'abc' })) as ToUpperDto;
    expect(result.code).toBe('ABC');
  });

  it('should apply serialize-only transform only during serialize', async () => {
    const dto = Object.assign(new SerializeTransformDto(), { price: 9 });
    const result = await baker.serialize(dto);
    expect(result['price']).toBe(900);
  });

  it('should not apply serialize-only transform during deserialize', async () => {
    const result = (await baker.deserialize<SerializeTransformDto>(SerializeTransformDto, { price: 9 })) as SerializeTransformDto;
    expect(result.price).toBe(9); // transform not applied during deserialize
  });
});
