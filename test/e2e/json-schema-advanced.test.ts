import { describe, it, expect, afterEach } from 'bun:test';
import {
  seal, toJsonSchema,
  IsNumber, IsString, IsObject, IsDivisibleBy, IsNotEmptyObject,
  Expose, Exclude,
} from '../../index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class WhitelistSchemaDto {
  @IsString()
  name!: string;

  @IsNumber()
  age!: number;
}

class DivisibleDto {
  @IsNumber()
  @IsDivisibleBy(5)
  count!: number;
}

class DirectionSchemaDto {
  @IsString()
  @Expose({ name: 'user_name', deserializeOnly: true })
  @Expose({ name: 'userName', serializeOnly: true })
  name!: string;

  @IsString()
  @Exclude({ serializeOnly: true })
  secret!: string;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('toJsonSchema — whitelist 옵션', () => {
  it('whitelist: true → unevaluatedProperties: false', () => {
    const schema = toJsonSchema(WhitelistSchemaDto, { whitelist: true });
    expect(schema.unevaluatedProperties).toBe(false);
  });

  it('whitelist 미설정 → unevaluatedProperties 없음', () => {
    const schema = toJsonSchema(WhitelistSchemaDto);
    expect(schema.unevaluatedProperties).toBeUndefined();
  });
});

describe('toJsonSchema — @IsDivisibleBy → multipleOf', () => {
  it('multipleOf 매핑', () => {
    const schema = toJsonSchema(DivisibleDto);
    expect(schema.properties!.count).toEqual({
      type: 'number',
      multipleOf: 5,
    });
  });
});

describe('toJsonSchema — @IsNotEmptyObject → minProperties', () => {
  class MinPropDto {
    @IsNotEmptyObject()
    config!: Record<string, unknown>;
  }
  it('minProperties: 1 매핑', () => {
    const schema = toJsonSchema(MinPropDto);
    expect(schema.properties!.config!.minProperties).toBe(1);
  });
});

describe('toJsonSchema — required 필드', () => {
  it('필수 필드 → required 배열에 포함', () => {
    const schema = toJsonSchema(WhitelistSchemaDto);
    expect(schema.required).toContain('name');
    expect(schema.required).toContain('age');
  });
});

describe('toJsonSchema — direction별 스키마 차이', () => {
  it('direction: deserialize → deserializeOnly @Expose name 사용', () => {
    const schema = toJsonSchema(DirectionSchemaDto, { direction: 'deserialize' });
    expect(schema.properties!['user_name']).toBeDefined();
    expect(schema.properties!['userName']).toBeUndefined();
    expect(schema.properties!['secret']).toBeDefined(); // serializeOnly Exclude → deserialize에서 보임
  });

  it('direction: serialize → serializeOnly @Expose name 사용', () => {
    const schema = toJsonSchema(DirectionSchemaDto, { direction: 'serialize' });
    expect(schema.properties!['userName']).toBeDefined();
    expect(schema.properties!['user_name']).toBeUndefined();
    expect(schema.properties!['secret']).toBeUndefined(); // serializeOnly Exclude → serialize에서 안 보임
  });
});
