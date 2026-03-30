import { describe, it, expect, afterEach } from 'bun:test';
import { getMeta, Field, deserialize, isBakerError } from '../../index';
import {
  isString, isNumber, isBoolean, isEnum, isInt,
  min, minLength, maxLength, isEmail,
  arrayMinSize,
} from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────
// discriminator + nullable
// ─────────────────────────────────────────────────────────────────────────────

describe('getMeta combination: discriminator + nullable', () => {
  class CatDto { @Field(isString) meow!: string; }
  class DogDto { @Field(isString) bark!: string; }

  class OwnerDto {
    @Field({
      type: () => CatDto,
      nullable: true,
      discriminator: { property: 'kind', subTypes: [{ value: CatDto, name: 'cat' }, { value: DogDto, name: 'dog' }] },
    }) pet!: CatDto | DogDto | null;
  }

  it('discriminator metadata present alongside nullable flag', () => {
    const meta = getMeta(OwnerDto);
    expect(meta['pet']!.type!.discriminator).toBeDefined();
    expect(meta['pet']!.type!.discriminator!.subTypes).toHaveLength(2);
    expect(meta['pet']!.flags.isNullable).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// discriminator + array
// ─────────────────────────────────────────────────────────────────────────────

describe('getMeta combination: discriminator + array', () => {
  class TextBlock { @Field(isString) text!: string; }
  class ImageBlock { @Field(isString) url!: string; }

  class PageDto {
    @Field({
      type: () => [TextBlock],
      discriminator: { property: 'type', subTypes: [{ value: TextBlock, name: 'text' }, { value: ImageBlock, name: 'image' }] },
    }) blocks!: (TextBlock | ImageBlock)[];
  }

  it('discriminator + isArray both accessible', () => {
    const meta = getMeta(PageDto);
    expect(meta['blocks']!.type!.discriminator).toBeDefined();
    expect(meta['blocks']!.type!.isArray).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Set + nullable / Map + nullable
// ─────────────────────────────────────────────────────────────────────────────

describe('getMeta combination: collection + nullable', () => {
  class TagDto { @Field(isString) label!: string; }

  class CollNullableDto {
    @Field({ type: () => Set as any, setValue: () => TagDto, nullable: true })
    tags!: Set<TagDto> | null;

    @Field({ type: () => Map as any, mapValue: () => TagDto, nullable: true })
    map!: Map<string, TagDto> | null;
  }

  it('Set + nullable', () => {
    const meta = getMeta(CollNullableDto);
    expect(meta['tags']!.type!.collection).toBe('Set');
    expect(meta['tags']!.flags.isNullable).toBe(true);
    expect(meta['tags']!.type!.resolvedCollectionValue).toBe(TagDto);
  });

  it('Map + nullable', () => {
    const meta = getMeta(CollNullableDto);
    expect(meta['map']!.type!.collection).toBe('Map');
    expect(meta['map']!.flags.isNullable).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// enum + nullable
// ─────────────────────────────────────────────────────────────────────────────

describe('getMeta combination: enum + nullable', () => {
  enum Status { Active = 'active', Inactive = 'inactive' }

  class EnumNullDto {
    @Field(isEnum(Status), { nullable: true }) status!: Status | null;
  }

  it('enum values + nullable flag', () => {
    const meta = getMeta(EnumNullDto);
    expect(meta['status']!.validation[0]!.rule.ruleName).toBe('isEnum');
    expect(meta['status']!.validation[0]!.rule.constraints?.values).toEqual(['active', 'inactive']);
    expect(meta['status']!.flags.isNullable).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// expose + nullable + nested
// ─────────────────────────────────────────────────────────────────────────────

describe('getMeta combination: expose + nullable + nested', () => {
  class InnerDto { @Field(isString) v!: string; }

  class ExposeNestedDto {
    @Field({ type: () => InnerDto, nullable: true, name: 'inner_data' })
    inner!: InnerDto | null;
  }

  it('expose name + nullable + resolvedClass all present', () => {
    const meta = getMeta(ExposeNestedDto);
    expect(meta['inner']!.expose.some(e => e.name === 'inner_data')).toBe(true);
    expect(meta['inner']!.flags.isNullable).toBe(true);
    expect(meta['inner']!.type!.resolvedClass).toBe(InnerDto);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// groups + exclude + discriminator
// ─────────────────────────────────────────────────────────────────────────────

describe('getMeta combination: groups + exclude + mixed fields', () => {
  class GroupMixDto {
    @Field(isString) public!: string;
    @Field(isString, { groups: ['admin'] }) adminOnly!: string;
    @Field(isString, { exclude: 'serializeOnly' }) writeOnly!: string;
    @Field(isString, { exclude: true }) hidden!: string;
  }

  it('all field metadata accessible for filtering', () => {
    const meta = getMeta(GroupMixDto);
    expect(meta['public']!.exclude).toBeNull();
    expect(meta['adminOnly']!.expose.some(e => e.groups?.includes('admin'))).toBe(true);
    expect(meta['writeOnly']!.exclude!.serializeOnly).toBe(true);
    expect(meta['hidden']!.exclude).not.toBeNull();
    expect(meta['hidden']!.exclude!.deserializeOnly).toBeUndefined();
    expect(meta['hidden']!.exclude!.serializeOnly).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// inheritance + discriminator
// ─────────────────────────────────────────────────────────────────────────────

describe('getMeta combination: inheritance + discriminator', () => {
  class AnimalDto { @Field(isString) name!: string; }
  class Cat2 extends AnimalDto { @Field(isString) meow!: string; }
  class Dog2 extends AnimalDto { @Field(isString) bark!: string; }

  class Zoo extends AnimalDto {
    @Field({
      type: () => AnimalDto,
      discriminator: { property: 'species', subTypes: [{ value: Cat2, name: 'cat' }, { value: Dog2, name: 'dog' }] },
    }) animal!: AnimalDto;
  }

  it('inherited field + own discriminator field', () => {
    const meta = getMeta(Zoo);
    expect(meta['name']).toBeDefined();
    expect(meta['animal']!.type!.discriminator!.property).toBe('species');
  });

  it('discriminator subType classes inherit parent fields via getMeta', () => {
    const catMeta = getMeta(Cat2);
    expect(catMeta['name']).toBeDefined();
    expect(catMeta['meow']).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// circular DTO → getMeta doesn't loop + resolvedClass correct
// ─────────────────────────────────────────────────────────────────────────────

describe('getMeta combination: circular reference', () => {
  class TreeNode {
    @Field(isString) value!: string;
    @Field({ type: () => [TreeNode], optional: true }) children?: TreeNode[];
  }

  it('circular resolvedClass points to self', () => {
    const meta = getMeta(TreeNode);
    expect(meta['children']!.type!.resolvedClass).toBe(TreeNode);
    expect(meta['children']!.type!.isArray).toBe(true);
    expect(meta['children']!.flags.isOptional).toBe(true);
  });

  it('OAS $ref generation from circular does not infinite loop', () => {
    const meta = getMeta(TreeNode);
    const cls = meta['children']!.type!.resolvedClass!;
    expect(cls.name).toBe('TreeNode');
    const nestedMeta = getMeta(cls);
    expect(nestedMeta['children']!.type!.resolvedClass).toBe(TreeNode);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// collection + inheritance
// ─────────────────────────────────────────────────────────────────────────────

describe('getMeta combination: collection + inheritance', () => {
  class BaseItem { @Field(isString) id!: string; }
  class SpecialItem extends BaseItem { @Field(isNumber()) score!: number; }

  class CollInheritDto {
    @Field({ type: () => Set as any, setValue: () => SpecialItem })
    items!: Set<SpecialItem>;
  }

  it('Set collection value is inherited class', () => {
    const meta = getMeta(CollInheritDto);
    expect(meta['items']!.type!.resolvedCollectionValue).toBe(SpecialItem);
  });

  it('inherited collection value class has parent + own fields', () => {
    const itemMeta = getMeta(SpecialItem);
    expect(itemMeta['id']).toBeDefined();
    expect(itemMeta['score']).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// direction-based expose (readOnly/writeOnly equivalent)
// ─────────────────────────────────────────────────────────────────────────────

describe('getMeta combination: direction-based expose/exclude', () => {
  class DirectionDto {
    @Field(isString) name!: string;
    @Field(isString, { exclude: 'serializeOnly' }) password!: string;
    @Field(isString, { exclude: 'deserializeOnly' }) computed!: string;
  }

  it('serializeOnly exclude → writeOnly equivalent', () => {
    const meta = getMeta(DirectionDto);
    expect(meta['password']!.exclude!.serializeOnly).toBe(true);
  });

  it('deserializeOnly exclude → readOnly equivalent', () => {
    const meta = getMeta(DirectionDto);
    expect(meta['computed']!.exclude!.deserializeOnly).toBe(true);
  });

  it('external package can map to OAS readOnly/writeOnly', () => {
    const meta = getMeta(DirectionDto);
    for (const [field, prop] of Object.entries(meta)) {
      if (prop.exclude?.serializeOnly) {
        expect(field).toBe('password');
      }
      if (prop.exclude?.deserializeOnly) {
        expect(field).toBe('computed');
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// multiple transforms on same field
// ─────────────────────────────────────────────────────────────────────────────

describe('getMeta combination: multiple transforms', () => {
  class MultiTransformDto {
    @Field(isString, { transform: ({ value }) => (value as string).trim() })
    name!: string;
  }

  it('transform array reflects all transforms', () => {
    const meta = getMeta(MultiTransformDto);
    expect(meta['name']!.transform.length).toBeGreaterThanOrEqual(1);
    expect(typeof meta['name']!.transform[0]!.fn).toBe('function');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Real-world complex DTO — everything combined
// ─────────────────────────────────────────────────────────────────────────────

describe('getMeta combination: real-world complex DTO', () => {
  enum Priority { Low = 'low', Medium = 'medium', High = 'high' }

  class AttachmentDto {
    @Field(isString) url!: string;
    @Field(isString, { optional: true }) mimeType?: string;
  }

  class CommentDto {
    @Field(isString, minLength(1)) body!: string;
    @Field(isString) authorId!: string;
    @Field({ type: () => [AttachmentDto], optional: true }) attachments?: AttachmentDto[];
  }

  class TicketDto {
    @Field(isString, minLength(1), maxLength(200)) title!: string;
    @Field(isString, { optional: true, nullable: true }) description?: string | null;
    @Field(isEnum(Priority)) priority!: Priority;
    @Field(isInt, min(0)) storyPoints!: number;
    @Field(isString, isEmail()) assigneeEmail!: string;
    @Field({ type: () => [CommentDto] }) comments!: CommentDto[];
    @Field({ type: () => Set as any, setValue: () => AttachmentDto }) attachments!: Set<AttachmentDto>;
    @Field(arrayMinSize(1), { name: 'tag_list' }) tags!: string[];
    @Field(isString, { exclude: 'serializeOnly' }) internalNote!: string;
    @Field(isString, { groups: ['admin'] }) adminField!: string;
    @Field(isBoolean) archived!: boolean;
  }

  it('all 11 fields present in meta', () => {
    const meta = getMeta(TicketDto);
    expect(Object.keys(meta)).toHaveLength(11);
  });

  it('title has string + minLength + maxLength', () => {
    const meta = getMeta(TicketDto);
    const rules = meta['title']!.validation.map(r => r.rule.ruleName);
    expect(rules).toContain('isString');
    expect(rules).toContain('minLength');
    expect(rules).toContain('maxLength');
  });

  it('description is optional + nullable', () => {
    const meta = getMeta(TicketDto);
    expect(meta['description']!.flags.isOptional).toBe(true);
    expect(meta['description']!.flags.isNullable).toBe(true);
  });

  it('priority has enum values', () => {
    const meta = getMeta(TicketDto);
    expect(meta['priority']!.validation[0]!.rule.constraints?.values).toEqual(['low', 'medium', 'high']);
  });

  it('comments is array of nested DTO', () => {
    const meta = getMeta(TicketDto);
    expect(meta['comments']!.type!.isArray).toBe(true);
    expect(meta['comments']!.type!.resolvedClass).toBe(CommentDto);
  });

  it('CommentDto has nested AttachmentDto array', () => {
    const commentMeta = getMeta(CommentDto);
    expect(commentMeta['attachments']!.type!.isArray).toBe(true);
    expect(commentMeta['attachments']!.type!.resolvedClass).toBe(AttachmentDto);
    expect(commentMeta['attachments']!.flags.isOptional).toBe(true);
  });

  it('attachments is Set collection', () => {
    const meta = getMeta(TicketDto);
    expect(meta['attachments']!.type!.collection).toBe('Set');
    expect(meta['attachments']!.type!.resolvedCollectionValue).toBe(AttachmentDto);
  });

  it('tags has expose name mapping', () => {
    const meta = getMeta(TicketDto);
    expect(meta['tags']!.expose.some(e => e.name === 'tag_list')).toBe(true);
  });

  it('internalNote has serializeOnly exclude', () => {
    const meta = getMeta(TicketDto);
    expect(meta['internalNote']!.exclude!.serializeOnly).toBe(true);
  });

  it('adminField has groups', () => {
    const meta = getMeta(TicketDto);
    expect(meta['adminField']!.expose.some(e => e.groups?.includes('admin'))).toBe(true);
  });

  it('deserialization with the same DTO works correctly', async () => {
    const input = {
      title: 'Bug Fix',
      priority: 'high',
      storyPoints: 3,
      assigneeEmail: 'dev@test.com',
      comments: [{ body: 'Fixed it', authorId: 'u1' }],
      attachments: [{ url: 'https://a.com/f.png' }],
      tag_list: ['bug', 'urgent'],
      internalNote: 'secret',
      adminField: 'admin-data',
      archived: false,
    };
    const result = await deserialize(TicketDto, input) as TicketDto;
    expect(isBakerError(result)).toBe(false);
    expect(result.title).toBe('Bug Fix');
    expect(result.comments).toHaveLength(1);
    expect(result.attachments).toBeInstanceOf(Set);
  });
});
