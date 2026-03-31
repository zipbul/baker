import { describe, it, expect, afterEach } from 'bun:test';
import { isErr } from '@zipbul/result';
import { Field, deserialize } from '../../index';
import { isString, isNumber, isBoolean } from '../../src/rules/index';
import { unseal } from './helpers/unseal';
import { SEALED } from '../../src/symbols';

// ─── DTOs ────────────────────────────────────────────────────────────────────

class CodegenSimpleDto {
  @Field(isString)
  name!: string;

  @Field(isNumber())
  value!: number;
}

class CodegenOptionalDto {
  @Field(isString)
  required!: string;

  @Field(isBoolean, { optional: true })
  flag?: boolean;
}

class CodegenTransformDto {
  @Field(isString, { transform: { deserialize: ({ value }) => typeof value === 'string' ? value.trim() : value, serialize: ({ value }) => value } })
  text!: string;
}

// ─────────────────────────────────────────────────────────────────────────────

afterEach(() => unseal());

describe('codegen — integration', () => {
  it('should generate _deserialize and _serialize functions after auto-seal', async () => {
    // Trigger auto-seal via deserialize
    await deserialize(CodegenSimpleDto, { name: 'Alice', value: 42 });
    const sealed = (CodegenSimpleDto as any)[SEALED];
    expect(sealed).toBeDefined();
    expect(typeof sealed._deserialize).toBe('function');
    expect(typeof sealed._serialize).toBe('function');
  });

  it('_deserialize should accept valid input and return instance', async () => {
    // Trigger auto-seal
    await deserialize(CodegenSimpleDto, { name: 'trigger', value: 0 });
    const sealed = (CodegenSimpleDto as any)[SEALED];
    const result = await sealed._deserialize({ name: 'Alice', value: 42 });
    expect(isErr(result)).toBe(false);
    expect((result as any).name).toBe('Alice');
    expect((result as any).value).toBe(42);
  });

  it('_deserialize should return error Result for invalid input', async () => {
    // Trigger auto-seal
    await deserialize(CodegenSimpleDto, { name: 'trigger', value: 0 });
    const sealed = (CodegenSimpleDto as any)[SEALED];
    const result = await sealed._deserialize({ name: 123, value: 'wrong' });
    expect(isErr(result)).toBe(true);
  });

  it('_serialize should return plain object', async () => {
    // Trigger auto-seal
    await deserialize(CodegenSimpleDto, { name: 'trigger', value: 0 });
    const sealed = (CodegenSimpleDto as any)[SEALED];
    const instance = Object.assign(new CodegenSimpleDto(), { name: 'Bob', value: 7 });
    const result = await sealed._serialize(instance);
    expect(result).toEqual({ name: 'Bob', value: 7 });
  });

  it('optional field should not cause error when absent', async () => {
    const result = await deserialize<CodegenOptionalDto>(CodegenOptionalDto, { required: 'hello' }) as CodegenOptionalDto;
    expect(result.required).toBe('hello');
  });

  it('optional field deserialized value should have required field', async () => {
    const result = await deserialize<CodegenOptionalDto>(CodegenOptionalDto, { required: 'hello' }) as CodegenOptionalDto;
    expect(result.required).toBe('hello');
  });

  it('transform should be applied in generated deserialize code', async () => {
    const result = await deserialize<CodegenTransformDto>(CodegenTransformDto, { text: '  trimmed  ' }) as CodegenTransformDto;
    expect(result.text).toBe('trimmed');
  });
});
