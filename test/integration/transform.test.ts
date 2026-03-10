import { describe, it, expect, afterEach } from 'bun:test';
import { deserialize, serialize, Field } from '../../index';
import { isString, isNumber } from '../../src/rules/index';
import { unseal } from './helpers/unseal';

// ─── DTOs ────────────────────────────────────────────────────────────────────

class TrimmedDto {
  @Field(isString, { transform: ({ value }) => typeof value === 'string' ? value.trim() : value })
  name!: string;
}

class ToUpperDto {
  @Field(isString, { transform: ({ value }) => typeof value === 'string' ? value.toUpperCase() : value })
  code!: string;
}

class SerializeTransformDto {
  @Field(isNumber(), { transform: ({ value, direction }) => direction === 'serialize' && typeof value === 'number' ? value * 100 : value })
  price!: number;
}

// ─────────────────────────────────────────────────────────────────────────────

afterEach(() => unseal());

describe('transform — integration', () => {
  it('should apply transform function during deserialization', async () => {
    const result = await deserialize<TrimmedDto>(TrimmedDto, { name: '  Alice  ' });
    expect(result.name).toBe('Alice');
  });

  it('should apply uppercase transform during deserialization', async () => {
    const result = await deserialize<ToUpperDto>(ToUpperDto, { code: 'abc' });
    expect(result.code).toBe('ABC');
  });

  it('should apply serialize-only transform only during serialize', async () => {
    const dto = Object.assign(new SerializeTransformDto(), { price: 9 });
    const result = await serialize(dto);
    expect(result['price']).toBe(900);
  });

  it('should not apply serialize-only transform during deserialize', async () => {
    const result = await deserialize<SerializeTransformDto>(SerializeTransformDto, { price: 9 });
    expect(result.price).toBe(9); // transform not applied during deserialize
  });
});
