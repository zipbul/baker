import { describe, it, expect } from 'bun:test';
import { toJsonSchema, Field } from '../../index';
import { isString, isNumber } from '../../src/rules/index';

// ─────────────────────────────────────────────────────────────────────────────
// @Field({ schema }) inheritance merge
// ─────────────────────────────────────────────────────────────────────────────

describe('schema inheritance merge', () => {
  it('자식에 schema 없으면 부모 object schema 계승', () => {
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

  it('자식과 부모 모두 object schema — 부모 속성이 자식에 없으면 보충', () => {
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
