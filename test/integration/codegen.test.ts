import { describe, it, expect, beforeEach } from 'bun:test';

import { Baker, Field, isBakerIssueSet } from '../../index';
import { isString, isNumber, isBoolean, isUint8Array, isByteSize } from '../../src/rules/index';

const baker = new Baker();

// ─── DTOs ────────────────────────────────────────────────────────────────────

@baker.Recipe
class CodegenSimpleDto {
  @Field(isString)
  name!: string;

  @Field(isNumber())
  value!: number;
}

@baker.Recipe
class CodegenOptionalDto {
  @Field(isString)
  required!: string;

  @Field(isBoolean, { optional: true })
  flag?: boolean;
}

@baker.Recipe
class CodegenTransformDto {
  @Field(isString, {
    transform: {
      deserialize: ({ value }) => (typeof value === 'string' ? value.trim() : value),
      serialize: ({ value }) => value,
    },
  })
  text!: string;
}

@baker.Recipe
class CodegenBinaryDto {
  @Field(isUint8Array, isByteSize(16))
  key!: Uint8Array;
}

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => baker.seal());

describe('codegen — integration', () => {
  it('should generate working deserialize and serialize executors after seal', async () => {
    const result = await baker.deserialize(CodegenSimpleDto, { name: 'Alice', value: 42 });
    expect(isBakerIssueSet(result)).toBe(false);
    const instance = Object.assign(new CodegenSimpleDto(), { name: 'Bob', value: 7 });
    const serialized = await baker.serialize(instance);
    expect(serialized).toEqual({ name: 'Bob', value: 7 });
  });

  it('deserialize should accept valid input and return instance', async () => {
    const result = await baker.deserialize(CodegenSimpleDto, { name: 'Alice', value: 42 });
    expect(isBakerIssueSet(result)).toBe(false);
    expect((result as CodegenSimpleDto).name).toBe('Alice');
    expect((result as CodegenSimpleDto).value).toBe(42);
  });

  it('deserialize should return BakerIssueSet for invalid input', async () => {
    const result = await baker.deserialize(CodegenSimpleDto, { name: 123, value: 'wrong' });
    expect(isBakerIssueSet(result)).toBe(true);
  });

  it('serialize should return plain object', async () => {
    const instance = Object.assign(new CodegenSimpleDto(), { name: 'Bob', value: 7 });
    const result = await baker.serialize(instance);
    expect(result).toEqual({ name: 'Bob', value: 7 });
  });

  it('optional field should not cause error when absent', async () => {
    const result = (await baker.deserialize<CodegenOptionalDto>(CodegenOptionalDto, { required: 'hello' })) as CodegenOptionalDto;
    expect(result.required).toBe('hello');
  });

  it('optional field deserialized value should have required field', async () => {
    const result = (await baker.deserialize<CodegenOptionalDto>(CodegenOptionalDto, { required: 'hello' })) as CodegenOptionalDto;
    expect(result.required).toBe('hello');
  });

  it('transform should be applied in generated deserialize code', async () => {
    const result = (await baker.deserialize<CodegenTransformDto>(CodegenTransformDto, { text: '  trimmed  ' })) as CodegenTransformDto;
    expect(result.text).toBe('trimmed');
  });

  it('should enforce binary rule checks (Uint8Array type + byte size) in generated deserialize', async () => {
    const ok = await baker.deserialize(CodegenBinaryDto, { key: new Uint8Array(16) });
    expect(isBakerIssueSet(ok)).toBe(false);

    const notBinary = await baker.deserialize(CodegenBinaryDto, { key: 'not-binary' });
    expect(isBakerIssueSet(notBinary)).toBe(true);

    const wrongSize = await baker.deserialize(CodegenBinaryDto, { key: new Uint8Array(8) });
    expect(isBakerIssueSet(wrongSize)).toBe(true);
  });
});
