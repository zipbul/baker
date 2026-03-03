import { describe, it, expect, afterEach } from 'bun:test';
import { seal, serialize, deserialize, IsString, IsNumber, Expose, Exclude, Transform } from '../../index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class NameMappedDto {
  @Expose({ name: 'full_name' })
  @IsString()
  name!: string;

  @IsNumber()
  age!: number;
}

class ExcludeSerDto {
  @IsString()
  visible!: string;

  @Exclude()
  @IsString()
  hidden!: string;
}

class SerOnlyTransformDto {
  @Transform(({ value }) => (value as number) * 100, { serializeOnly: true })
  @IsNumber()
  price!: number;
}

class DeserOnlyTransformDto {
  @Transform(({ value }) => (value as string).trim(), { deserializeOnly: true })
  @IsString()
  tag!: string;
}

class DirectionExposeDto {
  @Expose({ name: 'user_name', deserializeOnly: true })
  @Expose({ name: 'userName', serializeOnly: true })
  @IsString()
  name!: string;
}

class PipelineDto {
  @Expose({ name: 'display_name', serializeOnly: true })
  @Transform(({ value }) => `[${value}]`, { serializeOnly: true })
  @IsString()
  name!: string;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('serialize pipeline — @Expose name', () => {
  it('serialize 시 매핑된 키로 출력', async () => {
    seal();
    const dto = Object.assign(new NameMappedDto(), { name: 'Alice', age: 25 });
    const result = await serialize(dto);
    expect(result['full_name']).toBe('Alice');
    expect(result['name']).toBeUndefined();
    expect(result['age']).toBe(25);
  });
});

describe('serialize pipeline — @Exclude', () => {
  it('Exclude 필드 제외', async () => {
    seal();
    const dto = Object.assign(new ExcludeSerDto(), { visible: 'yes', hidden: 'no' });
    const result = await serialize(dto);
    expect(result['visible']).toBe('yes');
    expect(result['hidden']).toBeUndefined();
  });
});

describe('serialize pipeline — @Transform direction', () => {
  it('serializeOnly → serialize에만 적용', async () => {
    seal();
    const dto = Object.assign(new SerOnlyTransformDto(), { price: 9 });
    const result = await serialize(dto);
    expect(result['price']).toBe(900);
  });

  it('serializeOnly → deserialize에서는 미적용', async () => {
    seal();
    const result = await deserialize<SerOnlyTransformDto>(SerOnlyTransformDto, { price: 9 });
    expect(result.price).toBe(9);
  });

  it('deserializeOnly → serialize에서는 미적용', async () => {
    seal();
    const dto = Object.assign(new DeserOnlyTransformDto(), { tag: '  hello  ' });
    const result = await serialize(dto);
    expect(result['tag']).toBe('  hello  ');
  });

  it('deserializeOnly → deserialize에서 적용', async () => {
    seal();
    const result = await deserialize<DeserOnlyTransformDto>(DeserOnlyTransformDto, { tag: '  hello  ' });
    expect(result.tag).toBe('hello');
  });
});

describe('serialize pipeline — direction @Expose', () => {
  it('serialize → serializeOnly @Expose name 사용', async () => {
    seal();
    const dto = Object.assign(new DirectionExposeDto(), { name: 'Bob' });
    const result = await serialize(dto);
    expect(result['userName']).toBe('Bob');
    expect(result['user_name']).toBeUndefined();
  });

  it('deserialize → deserializeOnly @Expose name 사용', async () => {
    seal();
    const result = await deserialize<DirectionExposeDto>(DirectionExposeDto, { user_name: 'Carol' });
    expect(result.name).toBe('Carol');
  });
});

describe('serialize pipeline — @Expose + @Transform 조합', () => {
  it('serialize: Transform 적용 후 매핑된 키로 출력', async () => {
    seal();
    const dto = Object.assign(new PipelineDto(), { name: 'Dave' });
    const result = await serialize(dto);
    expect(result['display_name']).toBe('[Dave]');
    expect(result['name']).toBeUndefined();
  });
});
