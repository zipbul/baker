import { describe, it, expect } from 'bun:test';
import { toJsonSchema, Field } from '../../index';
import { isString, isNumber } from '../../src/rules/index';

// ─────────────────────────────────────────────────────────────────────────────
// @Field({ schema }) inheritance merge
// ─────────────────────────────────────────────────────────────────────────────

describe('schema inheritance merge', () => {
  it('child without schema inherits parent object schema', () => {
    class ParentFieldDto {
      @Field(isString, { schema: { description: 'parent name' } })
      name!: string;
    }
    class ChildFieldDto extends ParentFieldDto {
      @Field(isNumber())
      age!: number;
    }
    const schema = toJsonSchema(ChildFieldDto);
    const nameSchema = (schema.properties as any)?.name;
    expect(nameSchema?.description).toBe('parent name');
  });

  it('both child and parent have object schema — parent properties fill in missing child properties', () => {
    class ParentMergeDto {
      @Field(isString, { schema: { description: 'from parent' } })
      name!: string;
    }
    class ChildMergeDto extends ParentMergeDto {
      @Field(isString, { schema: { title: 'from child' } })
      declare name: string;
    }
    const schema = toJsonSchema(ChildMergeDto);
    const nameSchema = (schema.properties as any)?.name;
    expect(nameSchema?.title).toBe('from child');
    expect(nameSchema?.description).toBe('from parent');
  });
});
