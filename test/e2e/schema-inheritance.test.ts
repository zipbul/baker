import { describe, it, expect, afterEach } from 'bun:test';
import { seal, toJsonSchema, IsString, IsNumber, Schema } from '../../index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────
// seal.ts L246-253 — schema inheritance merge
// ─────────────────────────────────────────────────────────────────────────────

describe('schema inheritance merge', () => {
  it('자식에 schema 없으면 부모 object schema 계승', () => {
    class ParentFieldDto {
      @Schema({ description: 'parent name' })
      @IsString()
      name!: string;
    }
    class ChildFieldDto extends ParentFieldDto {
      @IsNumber()
      age!: number;
    }
    seal();
    const schema = toJsonSchema(ChildFieldDto);
    const nameSchema = (schema.properties as any)?.name;
    expect(nameSchema?.description).toBe('parent name');
  });

  it('자식과 부모 모두 object schema — 부모 속성이 자식에 없으면 보충', () => {
    class ParentMergeDto {
      @Schema({ description: 'from parent' })
      @IsString()
      name!: string;
    }
    class ChildMergeDto extends ParentMergeDto {
      @Schema({ title: 'from child' })
      @IsString()
      declare name: string;
    }
    seal();
    const schema = toJsonSchema(ChildMergeDto);
    const nameSchema = (schema.properties as any)?.name;
    expect(nameSchema?.title).toBe('from child');
    expect(nameSchema?.description).toBe('from parent');
  });

  it('자식 함수형 schema — 부모 무시', () => {
    class ParentFnDto {
      @Schema({ description: 'parent' })
      @IsString()
      name!: string;
    }
    class ChildFnDto extends ParentFnDto {
      @Schema((auto) => ({ ...auto, title: 'child fn' }))
      @IsString()
      declare name: string;
    }
    seal();
    const schema = toJsonSchema(ChildFnDto);
    const nameSchema = (schema.properties as any)?.name;
    expect(nameSchema?.title).toBe('child fn');
  });
});
