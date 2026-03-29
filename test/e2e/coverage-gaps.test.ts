import { describe, it, expect, afterEach, beforeEach } from 'bun:test';
import { deserialize, serialize, isBakerError, Field } from '../../index';
import { isString, isEmail, min, arrayMinSize } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';
import { SealError } from '../../src/errors';
import { globalRegistry } from '../../src/registry';

// ─────────────────────────────────────────────────────────────────────────────
// deserialize-builder.ts:560 — conflicting requiresType
// ─────────────────────────────────────────────────────────────────────────────

describe('conflicting requiresType → SealError', () => {
  afterEach(() => {
    for (const cls of [...globalRegistry]) globalRegistry.delete(cls);
    unseal();
  });

  it('isEmail (string) + min (number) on same field → SealError at seal time', () => {
    class ConflictDto {
      @Field(isEmail(), min(5)) value!: unknown;
    }
    expect(() => deserialize(ConflictDto, { value: 'x' })).toThrow(SealError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// deserialize-builder.ts:935-936 — array-level rules on Set collection
// ─────────────────────────────────────────────────────────────────────────────

describe('Set collection + array-level rules', () => {
  class SetItem {
    @Field(isString) name!: string;
  }

  class SetWithMinDto {
    @Field(arrayMinSize(2), { type: () => Set as any, setValue: () => SetItem })
    items!: Set<SetItem>;
  }

  it('Set with arrayMinSize — valid', async () => {
    const result = await deserialize(SetWithMinDto, { items: [{ name: 'a' }, { name: 'b' }] }) as SetWithMinDto;
    expect(result.items).toBeInstanceOf(Set);
    expect(result.items.size).toBe(2);
  });

  it('Set with arrayMinSize — too few items → error', async () => {
    const result = await deserialize(SetWithMinDto, { items: [{ name: 'a' }] });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors.some(e => e.code === 'arrayMinSize')).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// serialize-builder.ts:145 — async serialize of Set<DTO>
// ─────────────────────────────────────────────────────────────────────────────

describe('async serialize Set<DTO>', () => {
  class SetItemDto {
    @Field(isString) name!: string;
  }

  class AsyncSerSetDto {
    @Field({ type: () => Set as any, setValue: () => SetItemDto })
    items!: Set<SetItemDto>;

    @Field(isString, {
      transform: async ({ value }) => value,
    })
    other!: string;
  }

  it('serialize Set<DTO> when DTO has async transform on another field', async () => {
    const dto = await deserialize(AsyncSerSetDto, {
      items: [{ name: 'hello' }, { name: 'world' }],
      other: 'test',
    }) as AsyncSerSetDto;
    expect(dto.items).toBeInstanceOf(Set);
    const result = await serialize(dto);
    expect(result.items).toBeDefined();
    expect(Array.isArray(result.items)).toBe(true);
    expect((result.items as any[]).length).toBe(2);
  });
});
