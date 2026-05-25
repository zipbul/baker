import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { arrayOf, configure, deserialize, Field, Recipe, isBakerIssueSet, serialize, seal } from '../../index';
import { isNumber, isString, min, minLength } from '../../src/rules/index';
import { assertBakerIssueSet } from '../integration/helpers/assert';
import { sealClass } from '../integration/helpers/seal';
import { unseal } from '../integration/helpers/unseal';

beforeEach(() => unseal());
afterEach(() => {
  unseal();
  configure({});
});

describe('option combinations meta', () => {
  it('optional + autoConvert: missing value skips, present value converts and validates', async () => {
    @Recipe
    class Dto {
      @Field(isNumber(), min(0), { optional: true })
      count?: number;
    }

    configure({ autoConvert: true });
    seal();

    const missing = (await deserialize<Dto>(Dto, {})) as Dto;
    expect(missing.count).toBeUndefined();

    const converted = (await deserialize<Dto>(Dto, { count: '5' })) as Dto;
    expect(converted.count).toBe(5);
  });

  it('nullable + autoConvert: null passes, invalid string still fails', async () => {
    @Recipe
    class Dto {
      @Field(isNumber(), { nullable: true })
      count!: number | null;
    }

    configure({ autoConvert: true });
    seal();

    const nullable = (await deserialize<Dto>(Dto, { count: null })) as Dto;
    expect(nullable.count).toBeNull();

    expect(isBakerIssueSet(await deserialize(Dto, { count: 'abc' }))).toBe(true);
  });

  it('when + transform: skipped fields are not assigned, active fields are transformed and validated', async () => {
    seal();
    @Recipe
    class Dto {
      enabled!: boolean;

      @Field(isString, minLength(3), {
        when: obj => obj.enabled === true,
        transform: {
          deserialize: ({ value }) => String(value).trim(),
          serialize: ({ value }) => value,
        },
      })
      code!: string;
    }
    sealClass(Dto);

    const skipped = (await deserialize<Dto>(Dto, { enabled: false, code: ' x ' })) as Dto;
    expect('code' in skipped).toBe(false);

    const active = (await deserialize<Dto>(Dto, { enabled: true, code: ' abc ' })) as Dto;
    expect(active.code).toBe('abc');
  });

  it('whitelist + directional name mapping only allows mapped input keys', async () => {
    @Recipe
    class Dto {
      @Field(isString, { deserializeName: 'user_name', serializeName: 'userName' })
      name!: string;
    }

    configure({ forbidUnknown: true });
    seal();

    const ok = (await deserialize<Dto>(Dto, { user_name: 'alice' })) as Dto;
    expect(ok.name).toBe('alice');

    const bad = await deserialize(Dto, { name: 'alice' });
    assertBakerIssueSet(bad);
    expect(bad.errors[0]!.code).toBe('whitelistViolation');
  });

  it('groups affect deserialize visibility and serialize output consistently', async () => {
    seal();
    @Recipe
    class Dto {
      @Field(isString)
      publicName!: string;

      @Field(isString, { groups: ['admin'] })
      secret!: string;
    }
    sealClass(Dto);

    const publicParsed = (await deserialize<Dto>(Dto, {
      publicName: 'alice',
      secret: 'hidden',
    })) as Dto;
    expect(publicParsed.publicName).toBe('alice');
    expect('secret' in publicParsed).toBe(false);

    const adminParsed = (await deserialize<Dto>(
      Dto,
      {
        publicName: 'alice',
        secret: 'hidden',
      },
      { groups: ['admin'] },
    )) as Dto;
    expect(adminParsed.secret).toBe('hidden');

    const adminSerialized = await serialize(adminParsed, { groups: ['admin'] });
    expect(adminSerialized.secret).toBe('hidden');

    const publicSerialized = await serialize(adminParsed);
    expect(publicSerialized.secret).toBeUndefined();
  });

  it('arrayOf + optional validates only when present', async () => {
    seal();
    @Recipe
    class Dto {
      @Field(arrayOf(isString, minLength(2)), { optional: true })
      tags?: string[];
    }
    sealClass(Dto);

    const missing = (await deserialize<Dto>(Dto, {})) as Dto;
    expect(missing.tags).toBeUndefined();

    const valid = (await deserialize<Dto>(Dto, { tags: ['ab', 'cd'] })) as Dto;
    expect(valid.tags).toEqual(['ab', 'cd']);

    expect(isBakerIssueSet(await deserialize(Dto, { tags: ['a'] }))).toBe(true);
  });
});
