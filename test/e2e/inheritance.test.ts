import { describe, it, expect, afterEach } from 'bun:test';
import { seal, deserialize, serialize, toJsonSchema, IsString, IsNumber, IsBoolean, Min } from '../../index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class BaseDto {
  @IsString()
  name!: string;
}

class ChildDto extends BaseDto {
  @IsNumber()
  @Min(0)
  age!: number;
}

class GrandChildDto extends ChildDto {
  @IsBoolean()
  active!: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('inheritance — deserialize', () => {
  it('child → parent 필드 포함', async () => {
    seal();
    const result = await deserialize<ChildDto>(ChildDto, { name: 'Alice', age: 25 });
    expect(result).toBeInstanceOf(ChildDto);
    expect(result.name).toBe('Alice');
    expect(result.age).toBe(25);
  });

  it('grandchild → 모든 조상 필드 포함', async () => {
    seal();
    const result = await deserialize<GrandChildDto>(GrandChildDto, {
      name: 'Bob', age: 30, active: true,
    });
    expect(result).toBeInstanceOf(GrandChildDto);
    expect(result.name).toBe('Bob');
    expect(result.age).toBe(30);
    expect(result.active).toBe(true);
  });

  it('parent 규칙 위반 → child에서도 에러', async () => {
    seal();
    // age: -1 violates @Min(0) from ChildDto
    await expect(deserialize(GrandChildDto, { name: 'X', age: -1, active: true })).rejects.toThrow();
  });
});

describe('inheritance — serialize', () => {
  it('child → parent 필드 직렬화', async () => {
    seal();
    const dto = Object.assign(new ChildDto(), { name: 'Carol', age: 40 });
    const result = await serialize(dto);
    expect(result).toEqual({ name: 'Carol', age: 40 });
  });

  it('grandchild → 모든 필드 직렬화', async () => {
    seal();
    const dto = Object.assign(new GrandChildDto(), { name: 'Dave', age: 35, active: false });
    const result = await serialize(dto);
    expect(result).toEqual({ name: 'Dave', age: 35, active: false });
  });
});

describe('inheritance — toJsonSchema', () => {
  it('grandchild schema에 모든 조상 필드 포함', () => {
    const schema = toJsonSchema(GrandChildDto);
    expect(schema.properties!.name).toBeDefined();
    expect(schema.properties!.age).toBeDefined();
    expect(schema.properties!.active).toBeDefined();
    expect(schema.properties!.age.minimum).toBe(0);
  });
});
