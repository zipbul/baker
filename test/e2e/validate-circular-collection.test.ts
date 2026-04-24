import { describe, it, expect, afterEach } from 'bun:test';
import { validate, isBakerError, Field, configure } from '../../index';
import { isString, minLength } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => {
  unseal();
  configure({});
});

// ─────────────────────────────────────────────────────────────────────────────
// Covers deserialize-builder.ts generateCollectionCodeValidateOnly
// Set-of-self path (lines ~1537-1551, useInline=false branch)
// Map-of-self path (lines ~1602-1617, useInline=false branch)
//
// useInline flips to false when the nested DTO is already in the inline set —
// i.e., self-referencing collections reached from within an inline block.
// ─────────────────────────────────────────────────────────────────────────────

class SetNode {
  @Field(isString, minLength(1)) value!: string;
  @Field({
    optional: true,
    type: () => Set as unknown as new () => Set<SetNode>,
    setValue: () => SetNode,
  })
  children?: Set<SetNode>;
}

class MapNode {
  @Field(isString, minLength(1)) value!: string;
  @Field({
    optional: true,
    type: () => Map as unknown as new () => Map<string, MapNode>,
    mapValue: () => MapNode,
  })
  branches?: Map<string, MapNode>;
}

describe('validate() — self-recursive Set<DTO> (validateOnly, useInline=false)', () => {
  it('valid recursive set → true', async () => {
    const input = {
      value: 'root',
      children: [
        { value: 'a', children: [{ value: 'a1' }] },
        { value: 'b' },
      ],
    };
    expect(await validate(SetNode, input)).toBe(true);
  });

  it('depth-2 nested violation → BakerErrors with nested path', async () => {
    const input = {
      value: 'root',
      children: [
        { value: 'a', children: [{ value: '' }] }, // depth-2 minLength fail
      ],
    };
    const result = await validate(SetNode, input);
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      const err = result.errors.find(e => e.code === 'minLength');
      expect(err).toBeDefined();
      expect(err!.path).toBe('children[0].children[0].value');
    }
  });

  it('deeper recursion violation → path chains indices correctly', async () => {
    const input = {
      value: 'root',
      children: [
        {
          value: 'a',
          children: [
            { value: 'ok' },
            { value: '', children: [{ value: 'deep' }] },
          ],
        },
      ],
    };
    const result = await validate(SetNode, input);
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      const err = result.errors.find(e => e.code === 'minLength');
      expect(err).toBeDefined();
      expect(err!.path).toBe('children[0].children[1].value');
    }
  });

  it('nested set item not an object → invalidInput with depth path', async () => {
    const input = {
      value: 'root',
      children: [
        { value: 'a', children: ['not-an-object' as unknown as SetNode] },
      ],
    };
    const result = await validate(SetNode, input);
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      const err = result.errors.find(e => e.code === 'invalidInput');
      expect(err).toBeDefined();
      expect(err!.path).toBe('children[0].children[0].');
    }
  });
});

describe('validate() — self-recursive Map<string, DTO> (validateOnly, useInline=false)', () => {
  it('valid recursive map → true', async () => {
    const input = {
      value: 'root',
      branches: {
        left: { value: 'L', branches: { ll: { value: 'LL' } } },
        right: { value: 'R' },
      },
    };
    expect(await validate(MapNode, input)).toBe(true);
  });

  it('depth-2 nested violation → BakerErrors with nested path', async () => {
    const input = {
      value: 'root',
      branches: {
        a: { value: 'A', branches: { bad: { value: '' } } },
      },
    };
    const result = await validate(MapNode, input);
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      const err = result.errors.find(e => e.code === 'minLength');
      expect(err).toBeDefined();
      expect(err!.path).toBe('branches[a].branches[bad].value');
    }
  });

  it('deeper recursion violation → path chains keys correctly', async () => {
    const input = {
      value: 'root',
      branches: {
        lvl1: {
          value: 'A',
          branches: {
            lvl2a: { value: 'ok' },
            lvl2b: { value: '', branches: { lvl3: { value: 'deep' } } },
          },
        },
      },
    };
    const result = await validate(MapNode, input);
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      const err = result.errors.find(e => e.code === 'minLength');
      expect(err).toBeDefined();
      expect(err!.path).toBe('branches[lvl1].branches[lvl2b].value');
    }
  });

  it('nested map value not an object → invalidInput with depth path', async () => {
    const input = {
      value: 'root',
      branches: {
        a: {
          value: 'A',
          branches: { bad: 'not-an-object' as unknown as MapNode },
        },
      },
    };
    const result = await validate(MapNode, input);
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      const err = result.errors.find(e => e.code === 'invalidInput');
      expect(err).toBeDefined();
      expect(err!.path).toBe('branches[a].branches[bad].');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// stopAtFirstError: true (non-collectErrors) — covers the `else` branch
// inside the non-inline collection paths (lines ~1548, ~1613).
// ─────────────────────────────────────────────────────────────────────────────

describe('validate() — stopAtFirstError on self-recursive collections', () => {
  it('Set: depth-2 violation returns first error only', async () => {
    configure({ stopAtFirstError: true });
    const input = {
      value: 'root',
      children: [
        { value: 'a', children: [{ value: '' }, { value: '' }] },
      ],
    };
    const result = await validate(SetNode, input);
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.code).toBe('minLength');
      expect(result.errors[0]!.path).toBe('children[0].children[0].value');
    }
  });

  it('Map: depth-2 violation returns first error only', async () => {
    configure({ stopAtFirstError: true });
    const input = {
      value: 'root',
      branches: {
        a: {
          value: 'A',
          branches: { x: { value: '' }, y: { value: '' } },
        },
      },
    };
    const result = await validate(MapNode, input);
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.code).toBe('minLength');
      expect(result.errors[0]!.path).toBe('branches[a].branches[x].value');
    }
  });
});
