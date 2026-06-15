import { isErr } from '@zipbul/result';
import { describe, it, expect, beforeEach } from 'bun:test';

import { Baker, Field, deserialize } from '../../index';
import { requireSealed } from '../../src/meta-access';
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
  it('should generate deserialize and serialize functions after auto-seal', async () => {
    // Trigger auto-seal via deserialize
    await deserialize(CodegenSimpleDto, { name: 'Alice', value: 42 });
    const sealed = requireSealed(CodegenSimpleDto);
    expect(sealed).toBeDefined();
    expect(typeof sealed.deserialize).toBe('function');
    expect(typeof sealed.serialize).toBe('function');
  });

  it('deserialize should accept valid input and return instance', async () => {
    // Trigger auto-seal
    await deserialize(CodegenSimpleDto, { name: 'trigger', value: 0 });
    const sealed = requireSealed(CodegenSimpleDto);
    const result = await sealed.deserialize({ name: 'Alice', value: 42 });
    expect(isErr(result)).toBe(false);
    expect((result as CodegenSimpleDto).name).toBe('Alice');
    expect((result as CodegenSimpleDto).value).toBe(42);
  });

  it('deserialize should return error Result for invalid input', async () => {
    // Trigger auto-seal
    await deserialize(CodegenSimpleDto, { name: 'trigger', value: 0 });
    const sealed = requireSealed(CodegenSimpleDto);
    const result = await sealed.deserialize({ name: 123, value: 'wrong' });
    expect(isErr(result)).toBe(true);
  });

  it('serialize should return plain object', async () => {
    // Trigger auto-seal
    await deserialize(CodegenSimpleDto, { name: 'trigger', value: 0 });
    const sealed = requireSealed(CodegenSimpleDto);
    const instance = Object.assign(new CodegenSimpleDto(), { name: 'Bob', value: 7 });
    const result = await sealed.serialize(instance);
    expect(result).toEqual({ name: 'Bob', value: 7 });
  });

  it('optional field should not cause error when absent', async () => {
    const result = (await deserialize<CodegenOptionalDto>(CodegenOptionalDto, { required: 'hello' })) as CodegenOptionalDto;
    expect(result.required).toBe('hello');
  });

  it('optional field deserialized value should have required field', async () => {
    const result = (await deserialize<CodegenOptionalDto>(CodegenOptionalDto, { required: 'hello' })) as CodegenOptionalDto;
    expect(result.required).toBe('hello');
  });

  it('transform should be applied in generated deserialize code', async () => {
    const result = (await deserialize<CodegenTransformDto>(CodegenTransformDto, { text: '  trimmed  ' })) as CodegenTransformDto;
    expect(result.text).toBe('trimmed');
  });

  it('should inline binary rule checks (instanceof Uint8Array, ArrayBuffer.isView) into generated deserialize source', async () => {
    // Trigger auto-seal
    await deserialize(CodegenBinaryDto, { key: new Uint8Array(16) });
    const sealed = requireSealed(CodegenBinaryDto);
    const src = sealed.deserialize.toString();
    expect(src).toContain('instanceof Uint8Array');
    expect(src).toContain('ArrayBuffer.isView');
  });
});
