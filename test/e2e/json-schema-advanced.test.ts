import { describe, it, expect } from 'bun:test';
import { toJsonSchema, Field, createRule } from '../../index';
import { isString, isNumber, isDivisibleBy, isNotEmptyObject } from '../../src/rules/index';
import { collectClassSchema } from '../../src/collect';
import { RAW_CLASS_SCHEMA } from '../../src/symbols';
// ─────────────────────────────────────────────────────────────────────────────

class WhitelistSchemaDto {
  @Field(isString)
  name!: string;

  @Field(isNumber())
  age!: number;
}

class DivisibleDto {
  @Field(isNumber(), isDivisibleBy(5))
  count!: number;
}

class DirectionSchemaDto {
  @Field(isString, { deserializeName: 'user_name', serializeName: 'userName' })
  name!: string;

  @Field(isString, { exclude: 'serializeOnly' })
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

describe('toJsonSchema — isDivisibleBy → multipleOf', () => {
  it('multipleOf 매핑', () => {
    const schema = toJsonSchema(DivisibleDto);
    expect(schema.properties!.count).toEqual({
      type: 'number',
      multipleOf: 5,
    });
  });
});

describe('toJsonSchema — isNotEmptyObject → minProperties', () => {
  class MinPropDto {
    @Field(isNotEmptyObject())
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

// ─── E-27 (C-14): class-level @Schema deep merge ───────────────────────────

describe('E-27: class-level @Schema deep merge', () => {
  it('properties deep merge: auto properties preserved + extra added', () => {
    class ExtraPropsDto {
      @Field(isString) name!: string;
      @Field(isNumber()) age!: number;
    }
    collectClassSchema(ExtraPropsDto, {
      properties: { extra: { type: 'string' } },
    });

    const schema = toJsonSchema(ExtraPropsDto);
    // auto-generated properties preserved
    expect(schema.properties!.name).toEqual({ type: 'string' });
    expect(schema.properties!.age).toEqual({ type: 'number' });
    // extra property added via class-level @Schema
    expect(schema.properties!.extra).toEqual({ type: 'string' });

    // cleanup
    delete (ExtraPropsDto as any)[RAW_CLASS_SCHEMA];
  });

  it('required deep merge: merged with auto-generated required', () => {
    class RequiredMergeDto {
      @Field(isString) name!: string;
      @Field(isNumber(), { optional: true }) age?: number;
    }
    collectClassSchema(RequiredMergeDto, {
      required: ['extra'],
    });

    const schema = toJsonSchema(RequiredMergeDto);
    // auto-generated required includes 'name' (age is optional)
    expect(schema.required).toContain('name');
    // class-level @Schema adds 'extra' to required
    expect(schema.required).toContain('extra');
    // age should not be in required
    expect(schema.required).not.toContain('age');

    // cleanup
    delete (RequiredMergeDto as any)[RAW_CLASS_SCHEMA];
  });

  it('title and description from class-level @Schema', () => {
    class TitledDto {
      @Field(isString) value!: string;
    }
    collectClassSchema(TitledDto, {
      title: 'MyDto',
      description: 'A DTO with title',
    });

    const schema = toJsonSchema(TitledDto);
    expect(schema.title).toBe('MyDto');
    expect(schema.description).toBe('A DTO with title');
    expect(schema.properties!.value).toEqual({ type: 'string' });

    // cleanup
    delete (TitledDto as any)[RAW_CLASS_SCHEMA];
  });
});

// ─── groups filtering: all validation rules have groups, none match ──────────

describe('toJsonSchema — groups filtering via validation rules', () => {
  it('field with only grouped validation rules is excluded when no group matches', () => {
    class GroupedRulesDto {
      @Field(isString) name!: string;

      @Field(isNumber(), { groups: ['admin'] })
      secret!: number;
    }
    const schema = toJsonSchema(GroupedRulesDto, { groups: ['user'] });
    expect(schema.properties!['name']).toBeDefined();
    // secret has only 'admin' group rules, ctx.groups=['user'] → excluded
    expect(schema.properties!['secret']).toBeUndefined();
  });

  it('field with grouped validation rules is included when group matches', () => {
    class GroupedRulesDto2 {
      @Field(isString) name!: string;

      @Field(isNumber(), { groups: ['admin'] })
      secret!: number;
    }
    const schema = toJsonSchema(GroupedRulesDto2, { groups: ['admin'] });
    expect(schema.properties!['name']).toBeDefined();
    expect(schema.properties!['secret']).toBeDefined();
  });

  it('serializeOnly expose + grouped rules: excluded from deserialize schema when no rule group matches', () => {
    // dirExposes.length === 0 (serializeOnly filtered out in deserialize direction)
    // + all validation rules have groups → groups filtering via rules
    class SerializeGroupDto {
      @Field(isString) name!: string;

      @Field(isNumber(), { serializeName: 'out_val', groups: ['admin'] })
      val!: number;
    }
    const schema = toJsonSchema(SerializeGroupDto, { direction: 'deserialize', groups: ['user'] });
    expect(schema.properties!['name']).toBeDefined();
    // val: serializeOnly expose filtered → dirExposes.length=0; all rules have groups=['admin'], ctx groups=['user'] → no match → excluded
    expect(schema.properties!['val']).toBeUndefined();
  });
});

// ─── nullable discriminator → oneOf + null ──────────────────────────────────

describe('toJsonSchema — nullable discriminator nested type', () => {
  class CatDto {
    @Field(isString) meow!: string;
  }
  class DogDto {
    @Field(isString) bark!: string;
  }

  it('nullable discriminator field → oneOf includes null', () => {
    class PetOwnerDto {
      @Field(isString) name!: string;

      @Field({
        type: () => CatDto,
        discriminator: {
          property: 'kind',
          subTypes: [
            { value: CatDto, name: 'cat' },
            { value: DogDto, name: 'dog' },
          ],
        },
        nullable: true,
      })
      pet!: CatDto | DogDto | null;
    }
    const schema = toJsonSchema(PetOwnerDto);
    const petSchema = schema.properties!['pet'];
    // discriminator produces oneOf; nullable adds { type: 'null' } to oneOf
    expect(petSchema!.oneOf).toBeDefined();
    const nullEntry = petSchema!.oneOf!.find((s: any) => s.type === 'null');
    expect(nullEntry).toEqual({ type: 'null' });
  });
});

// ─── onUnmappedRule callback ────────────────────────────────────────────────

describe('toJsonSchema — onUnmappedRule callback', () => {
  it('calls onUnmappedRule for rules without schema mapping', () => {
    const customRule = createRule('myCustomCheck', (v: unknown) => typeof v === 'string');

    class CustomRuleDto {
      @Field(customRule)
      value!: string;
    }

    const unmapped: [string, string][] = [];
    toJsonSchema(CustomRuleDto, {
      onUnmappedRule: (ruleName, fieldKey) => {
        unmapped.push([ruleName, fieldKey]);
      },
    });
    expect(unmapped).toContainEqual(['myCustomCheck', 'value']);
  });
});
