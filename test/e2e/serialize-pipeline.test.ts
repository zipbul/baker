import { describe, it, expect } from 'bun:test';
import { serialize, deserialize, Field, Exclude } from '../../index';
import { isString, isNumber } from '../../src/rules/index';
import { Expose, Transform } from '../../src/decorators/transform';

// ─────────────────────────────────────────────────────────────────────────────

class NameMappedDto {
  @Field(isString, { name: 'full_name' })
  name!: string;

  @Field(isNumber())
  age!: number;
}

class ExcludeSerDto {
  @Field(isString)
  visible!: string;

  @Exclude()
  @Field(isString)
  hidden!: string;
}

class SerOnlyTransformDto {
  @Transform(({ value }) => (value as number) * 100, { serializeOnly: true })
  @Field(isNumber())
  price!: number;
}

class DeserOnlyTransformDto {
  @Transform(({ value }) => (value as string).trim(), { deserializeOnly: true })
  @Field(isString)
  tag!: string;
}

class DirectionExposeDto {
  @Field(isString)
  @Expose({ name: 'user_name', deserializeOnly: true })
  @Expose({ name: 'userName', serializeOnly: true })
  name!: string;
}

class PipelineDto {
  @Field(isString)
  @Expose({ name: 'display_name', serializeOnly: true })
  @Transform(({ value }) => `[${value}]`, { serializeOnly: true })
  name!: string;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('serialize pipeline — @Field({ name })', () => {
  it('serialize 시 매핑된 키로 출력', async () => {
    const dto = Object.assign(new NameMappedDto(), { name: 'Alice', age: 25 });
    const result = await serialize(dto);
    expect(result['full_name']).toBe('Alice');
    expect(result['name']).toBeUndefined();
    expect(result['age']).toBe(25);
  });
});

describe('serialize pipeline — @Exclude', () => {
  it('Exclude 필드 제외', async () => {
    const dto = Object.assign(new ExcludeSerDto(), { visible: 'yes', hidden: 'no' });
    const result = await serialize(dto);
    expect(result['visible']).toBe('yes');
    expect(result['hidden']).toBeUndefined();
  });
});

describe('serialize pipeline — @Transform direction', () => {
  it('serializeOnly → serialize에만 적용', async () => {
    const dto = Object.assign(new SerOnlyTransformDto(), { price: 9 });
    const result = await serialize(dto);
    expect(result['price']).toBe(900);
  });

  it('serializeOnly → deserialize에서는 미적용', async () => {
    const result = await deserialize<SerOnlyTransformDto>(SerOnlyTransformDto, { price: 9 });
    expect(result.price).toBe(9);
  });

  it('deserializeOnly → serialize에서는 미적용', async () => {
    const dto = Object.assign(new DeserOnlyTransformDto(), { tag: '  hello  ' });
    const result = await serialize(dto);
    expect(result['tag']).toBe('  hello  ');
  });

  it('deserializeOnly → deserialize에서 적용', async () => {
    const result = await deserialize<DeserOnlyTransformDto>(DeserOnlyTransformDto, { tag: '  hello  ' });
    expect(result.tag).toBe('hello');
  });
});

describe('serialize pipeline — direction @Expose', () => {
  it('serialize → serializeOnly @Expose name 사용', async () => {
    const dto = Object.assign(new DirectionExposeDto(), { name: 'Bob' });
    const result = await serialize(dto);
    expect(result['userName']).toBe('Bob');
    expect(result['user_name']).toBeUndefined();
  });

  it('deserialize → deserializeOnly @Expose name 사용', async () => {
    const result = await deserialize<DirectionExposeDto>(DirectionExposeDto, { user_name: 'Carol' });
    expect(result.name).toBe('Carol');
  });
});

describe('serialize pipeline — @Expose + @Transform 조합', () => {
  it('serialize: Transform 적용 후 매핑된 키로 출력', async () => {
    const dto = Object.assign(new PipelineDto(), { name: 'Dave' });
    const result = await serialize(dto);
    expect(result['display_name']).toBe('[Dave]');
    expect(result['name']).toBeUndefined();
  });
});
