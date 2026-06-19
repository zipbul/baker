import { describe, it, expect, afterEach, spyOn } from 'bun:test';

import type { RawClassMeta, RuleDef } from '../metadata/types';

import { assertBakerIssueSet } from '../../test/integration/helpers/assert';
import { sealClass } from '../../test/integration/helpers/seal';
import { unseal } from '../../test/integration/helpers/unseal';
import { BakerError, isBakerIssueSet } from '../common/errors';
import { setRaw } from '../metadata/meta-access';
import { min, max } from '../rules/number';
import { isString } from '../rules/typechecker';
import { circularPlaceholder } from './circular-placeholder';
import { mergeInheritance } from './merge-inheritance';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeStringField(name: string, rules: RuleDef[] = []): RawClassMeta {
  return {
    [name]: {
      validation: rules.length > 0 ? rules : [{ rule: isString }],
      transform: [],
      expose: [],
      exclude: null,
      type: null,
      flags: {},
    },
  };
}

function makeEmptyMeta(): RawClassMeta {
  return {};
}

// ─────────────────────────────────────────────────────────────────────────────
// Cleanup — roll back every class sealed via sealClass()
// ─────────────────────────────────────────────────────────────────────────────

afterEach(() => {
  unseal();
});

// ─────────────────────────────────────────────────────────────────────────────
// sealClass — single-class seal via a fresh Baker
// ─────────────────────────────────────────────────────────────────────────────

describe('sealClass', () => {
  // ── Happy Path ─────────────────────────────────────────────────────────────

  it('should register the class in the baker after sealing', () => {
    // Arrange
    class UserDto {}
    setRaw(UserDto, makeStringField('name'));
    // Act
    const b = sealClass(UserDto);
    // Assert — the baker can run the sealed class without throwing "not sealed by this baker"
    expect(() => b.deserialize(UserDto, { name: 'x' })).not.toThrow();
    expect(() => b.serialize(new UserDto())).not.toThrow();
  });

  it('should seal a DTO with @IsString field — deserialize returns instance for valid input', async () => {
    // Arrange
    class PersonDto {}
    setRaw(PersonDto, makeStringField('name'));
    const b = sealClass(PersonDto);
    // Act
    const result = await b.deserialize(PersonDto, { name: 'Alice' });
    // Assert
    expect(result).toBeInstanceOf(PersonDto);
    // @ts-ignore
    expect(result.name).toBe('Alice');
  });

  it('should seal a DTO with @IsString field — deserialize returns error for invalid input', async () => {
    // Arrange
    class PersonDto2 {}
    setRaw(PersonDto2, makeStringField('name'));
    const b = sealClass(PersonDto2);
    // Act
    const result = await b.deserialize(PersonDto2, { name: 42 });
    // Assert — should be a BakerIssueSet with an errors array
    expect(isBakerIssueSet(result)).toBe(true);
    assertBakerIssueSet(result);
    expect(Array.isArray(result.errors)).toBe(true);
  });

  it('should seal @Type nested DTO so nested class is also sealed', () => {
    // Arrange
    class AddressDto {}
    setRaw(AddressDto, makeStringField('city'));

    class OrderDto {}
    setRaw(OrderDto, {
      address: {
        validation: [],
        transform: [],
        expose: [],
        exclude: null,
        type: { fn: () => AddressDto },
        flags: { validateNested: true },
      },
    });
    // Act
    const b = sealClass(OrderDto);
    // Assert — nested DTO also sealed (baker can run it without "not sealed" error)
    expect(() => b.deserialize(AddressDto, { city: 'x' })).not.toThrow();
  });

  // ── Negative / Error ───────────────────────────────────────────────────────

  it('should throw BakerError when @Expose has both deserializeOnly and serializeOnly', () => {
    // Arrange
    class BadExposeDto {}
    setRaw(BadExposeDto, {
      field: {
        validation: [{ rule: isString }],
        transform: [],
        expose: [{ deserializeOnly: true, serializeOnly: true }], // invalid
        exclude: null,
        type: null,
        flags: {},
      },
    });
    // Act / Assert
    expect(() => sealClass(BadExposeDto)).toThrow(BakerError);
  });

  // ── Corner ─────────────────────────────────────────────────────────────────

  it('should handle circular @Type via placeholder without infinite recursion', () => {
    // Arrange — self-referencing DTO
    class TreeDto {}
    setRaw(TreeDto, {
      value: { validation: [{ rule: isString }], transform: [], expose: [], exclude: null, type: null, flags: {} },
      child: {
        validation: [],
        transform: [],
        expose: [],
        exclude: null,
        type: { fn: () => TreeDto },
        flags: { validateNested: true },
      },
    });
    // Act / Assert — should not throw or infinite loop
    expect(() => sealClass(TreeDto)).not.toThrow();
  });

  // ── Edge ───────────────────────────────────────────────────────────────────

  it('should succeed when DTO has no fields (empty metadata)', () => {
    // Arrange
    class EmptyDto {}
    setRaw(EmptyDto, makeEmptyMeta());
    // Act / Assert
    let b!: ReturnType<typeof sealClass>;
    expect(() => {
      b = sealClass(EmptyDto);
    }).not.toThrow();
    expect(() => b.deserialize(EmptyDto, {})).not.toThrow();
  });

  // ── Idempotency ────────────────────────────────────────────────────────────

  it('should produce equivalent executors after seal → unseal → seal cycle', async () => {
    // Arrange
    class IdempDto {}
    setRaw(IdempDto, makeStringField('name'));
    const b1 = sealClass(IdempDto);
    const firstResult = await b1.deserialize(IdempDto, { name: 'Bob' });

    // Unseal (now a no-op for RAW) then re-seal in a fresh baker
    unseal();
    const b2 = sealClass(IdempDto);
    const secondResult = await b2.deserialize(IdempDto, { name: 'Bob' });
    // Assert — both produce instances with same values
    expect(firstResult).toBeInstanceOf(IdempDto);
    expect(secondResult).toBeInstanceOf(IdempDto);
    // @ts-ignore
    expect(firstResult.name).toBe(secondResult.name);
  });

  it('should recursively seal discriminator subType classes', () => {
    // Arrange — parent DTO with a polymorphic discriminator field
    class DogDto {}
    class CatDto {}
    setRaw(DogDto, makeEmptyMeta());
    setRaw(CatDto, makeEmptyMeta());

    class AnimalContainerDto {}
    const raw: RawClassMeta = {
      animal: {
        validation: [],
        transform: [],
        expose: [],
        exclude: null,
        type: {
          fn: () => DogDto,
          discriminator: {
            property: 'type',
            subTypes: [
              { name: 'dog', value: DogDto },
              { name: 'cat', value: CatDto },
            ],
          },
        },
        flags: { validateNested: true },
      },
    };
    setRaw(AnimalContainerDto, raw);

    // Act
    const b = sealClass(AnimalContainerDto);

    // Assert — both subtype classes must be sealed by the recursive call
    expect(() => b.deserialize(DogDto, {})).not.toThrow();
    expect(() => b.deserialize(CatDto, {})).not.toThrow();
    expect(() => b.deserialize(AnimalContainerDto, {})).not.toThrow();
  });

  // ── DX-5: @Type without @ValidateNested ────────────────────────────────────

  it('should auto-set validateNested when @Type points to a DTO class (replaces DX-5 warning)', () => {
    // Arrange
    class NestedTarget {}
    setRaw(NestedTarget, makeEmptyMeta());

    class AutoNestedDto {}
    setRaw(AutoNestedDto, {
      nested: {
        validation: [],
        transform: [],
        expose: [],
        exclude: null,
        type: { fn: () => NestedTarget },
        flags: {}, // no validateNested — seal should auto-set it
      },
    });
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    // Act
    const b = sealClass(AutoNestedDto);
    // Assert — no warning, nested DTO is auto-resolved
    expect(warnSpy).not.toHaveBeenCalled();
    expect(() => b.deserialize(AutoNestedDto, {})).not.toThrow();
    warnSpy.mockRestore();
  });

  // ── Recursive nested seal + freeze ─────────────────────────────────────────

  it('should recursively seal nested DTOs', () => {
    // Arrange — parent + nested DTO
    class Nested {}
    setRaw(Nested, makeStringField('val'));

    class Parent {}
    setRaw(Parent, {
      child: {
        validation: [],
        transform: [],
        expose: [],
        exclude: null,
        type: { fn: () => Nested },
        flags: {},
      },
    });

    // Act — seal should seal Parent AND recursively seal Nested
    const b = sealClass(Parent);

    // Assert — both sealed
    expect(() => b.deserialize(Parent, {})).not.toThrow();
    expect(() => b.deserialize(Nested, { val: 'x' })).not.toThrow();
  });

  it('should throw BakerError when @Type returns invalid value (null/non-function)', () => {
    // Arrange
    class BadTypeDto {}
    setRaw(BadTypeDto, {
      field: {
        validation: [],
        transform: [],
        expose: [],
        exclude: null,
        type: { fn: () => null as never },
        flags: {},
      },
    });
    // Act / Assert
    expect(() => sealClass(BadTypeDto)).toThrow(BakerError);
  });

  it('should clean up stale placeholders when seal fails', () => {
    // Arrange — nested DTO has banned field name 'constructor' → BakerError
    class BrokenNested {}
    const brokenRaw: RawClassMeta = Object.create(null) as RawClassMeta;
    brokenRaw['constructor'] = { validation: [], transform: [], expose: [], exclude: null, type: null, flags: {} };
    setRaw(BrokenNested, brokenRaw);

    class ParentDto {}
    setRaw(ParentDto, {
      child: {
        validation: [],
        transform: [],
        expose: [],
        exclude: null,
        type: { fn: () => BrokenNested },
        flags: { validateNested: true },
      },
    });
    // Act / Assert — seal fails loudly. The throw itself proves no half-built
    // executor was committed; rollback of stale placeholders is covered by the
    // dedicated transactional tests in test/integration/seal.test.ts.
    expect(() => sealClass(ParentDto)).toThrow(BakerError);
  });

  // ── DX-5 transform filter callback coverage ────────────────────────────────

  it('should auto-set validateNested even when @Type field has serializeOnly-only transforms', () => {
    // Arrange — transform has serializeOnly, @Type points to DTO → auto nested
    class NestedA {}
    setRaw(NestedA, makeEmptyMeta());

    class AutoNestedTransformDto {}
    setRaw(AutoNestedTransformDto, {
      nested: {
        validation: [],
        transform: [{ fn: () => 'x', options: { serializeOnly: true } }],
        expose: [],
        exclude: null,
        type: { fn: () => NestedA },
        flags: {}, // no validateNested — seal should auto-set it
      },
    });
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    // Act
    const b = sealClass(AutoNestedTransformDto);
    // Assert — no warning, nested DTO is auto-resolved
    expect(warnSpy).not.toHaveBeenCalled();
    expect(() => b.deserialize(AutoNestedTransformDto, {})).not.toThrow();
    warnSpy.mockRestore();
  });

  it('should invoke transform.filter callback and skip warn when @Type field has bidirectional transform', () => {
    // Arrange — bidirectional transform → filter returns true → length=1 → no warn
    class NestedB {}
    setRaw(NestedB, makeEmptyMeta());

    class NoWarnTransformDto {}
    setRaw(NoWarnTransformDto, {
      nested: {
        validation: [],
        transform: [{ fn: () => 'x' }],
        expose: [],
        exclude: null,
        type: { fn: () => NestedB },
        flags: {}, // no validateNested
      },
    });
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    // Act
    sealClass(NoWarnTransformDto);
    // Assert — no warn because there IS a deserialize-direction transform
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mergeInheritance
// ─────────────────────────────────────────────────────────────────────────────

describe('mergeInheritance', () => {
  it('should return own RAW only when class has no parent with RAW', () => {
    // Arrange
    class StandaloneDto {}
    const raw = makeStringField('name');
    setRaw(StandaloneDto, raw);
    // Act
    const merged = mergeInheritance(StandaloneDto);
    // Assert
    expect(merged.name).toBeDefined();
    expect(merged.name!.validation.length).toBe(1);
  });

  it('should union-merge validation rules from parent and child', () => {
    // Arrange
    class BaseDto {}
    setRaw(BaseDto, {
      name: { validation: [{ rule: isString }], transform: [], expose: [], exclude: null, type: null, flags: {} },
    });

    class ChildDto extends BaseDto {}
    setRaw(ChildDto, {
      name: { validation: [{ rule: min(1) }], transform: [], expose: [], exclude: null, type: null, flags: {} },
    });
    // Act
    const merged = mergeInheritance(ChildDto);
    // Assert — both isString and min(1) should be present
    expect(merged.name!.validation.length).toBe(2);
  });

  it('should ignore parent transform when child has its own transform', () => {
    // Arrange
    const parentFn = ({ value }: { value: unknown }): unknown => (value as string).trim();
    const childFn = ({ value }: { value: unknown }): unknown => (value as string).toLowerCase();

    class BaseTr {}
    setRaw(BaseTr, {
      name: { validation: [], transform: [{ fn: parentFn }], expose: [], exclude: null, type: null, flags: {} },
    });
    class ChildTr extends BaseTr {}
    setRaw(ChildTr, {
      name: { validation: [], transform: [{ fn: childFn }], expose: [], exclude: null, type: null, flags: {} },
    });
    // Act
    const merged = mergeInheritance(ChildTr);
    // Assert — only child transform
    expect(merged.name!.transform.length).toBe(1);
    expect(merged.name!.transform[0]!.fn).toBe(childFn);
  });

  it('should inherit parent transform when child has none', () => {
    // Arrange
    const parentFn2 = ({ value }: { value: unknown }): unknown => value;
    class BaseTr2 {}
    setRaw(BaseTr2, {
      x: { validation: [], transform: [{ fn: parentFn2 }], expose: [], exclude: null, type: null, flags: {} },
    });
    class ChildTr2 extends BaseTr2 {}
    setRaw(ChildTr2, {
      x: { validation: [{ rule: isString }], transform: [], expose: [], exclude: null, type: null, flags: {} },
    });
    // Act
    const merged = mergeInheritance(ChildTr2);
    // Assert — parent transform inherited
    expect(merged.x!.transform.length).toBe(1);
    expect(merged.x!.transform[0]!.fn).toBe(parentFn2);
  });

  it('should override parent expose with child expose when child has @Expose', () => {
    // Arrange
    class BaseEx {}
    setRaw(BaseEx, {
      field: { validation: [], transform: [], expose: [{ name: 'parent_name' }], exclude: null, type: null, flags: {} },
    });
    class ChildEx extends BaseEx {}
    setRaw(ChildEx, {
      field: { validation: [], transform: [], expose: [{ name: 'child_name' }], exclude: null, type: null, flags: {} },
    });
    // Act
    const merged = mergeInheritance(ChildEx);
    // Assert — child name used, not parent
    expect(merged.field!.expose[0]!.name).toBe('child_name');
  });

  it('should inherit parent expose when child has no @Expose', () => {
    // Arrange
    class BaseEx2 {}
    setRaw(BaseEx2, {
      field: { validation: [], transform: [], expose: [{ name: 'parent_exposed' }], exclude: null, type: null, flags: {} },
    });
    class ChildEx2 extends BaseEx2 {}
    setRaw(ChildEx2, {
      field: { validation: [{ rule: isString }], transform: [], expose: [], exclude: null, type: null, flags: {} },
    });
    // Act
    const merged = mergeInheritance(ChildEx2);
    // Assert — parent expose inherited
    expect(merged.field!.expose.length).toBe(1);
    expect(merged.field!.expose[0]!.name).toBe('parent_exposed');
  });

  it('should inherit parent exclude when child has no exclude', () => {
    // Arrange
    class BaseExcl {}
    setRaw(BaseExcl, {
      secret: { validation: [], transform: [], expose: [], exclude: { serializeOnly: true }, type: null, flags: {} },
    });
    class ChildExcl extends BaseExcl {}
    setRaw(ChildExcl, {
      secret: { validation: [{ rule: isString }], transform: [], expose: [], exclude: null, type: null, flags: {} },
    });
    // Act
    const merged = mergeInheritance(ChildExcl);
    // Assert
    expect(merged.secret!.exclude).toEqual({ serializeOnly: true });
  });

  it('should inherit parent type when child has no @Type', () => {
    // Arrange
    class NestedDto {}
    class BaseType {}
    setRaw(BaseType, {
      nested: { validation: [], transform: [], expose: [], exclude: null, type: { fn: () => NestedDto }, flags: {} },
    });
    class ChildType extends BaseType {}
    setRaw(ChildType, {
      nested: { validation: [], transform: [], expose: [], exclude: null, type: null, flags: {} },
    });
    // Act
    const merged = mergeInheritance(ChildType);
    // Assert
    expect(merged.nested!.type?.fn()).toBe(NestedDto);
  });

  it('should apply child-first flag merge (isOptional)', () => {
    // Arrange
    class BaseFlag {}
    setRaw(BaseFlag, {
      age: { validation: [], transform: [], expose: [], exclude: null, type: null, flags: { isOptional: true } },
    });
    class ChildFlag extends BaseFlag {}
    setRaw(ChildFlag, {
      age: { validation: [], transform: [], expose: [], exclude: null, type: null, flags: {} },
    });
    // Act
    const merged = mergeInheritance(ChildFlag);
    // Assert — parent flag inherited (child has none)
    expect(merged.age!.flags.isOptional).toBe(true);
  });

  it('should not add duplicate validation rules during union merge', () => {
    // Arrange — same rule instance in both parent and child
    const sharedRule = isString;
    class BaseDup {}
    setRaw(BaseDup, {
      f: { validation: [{ rule: sharedRule }], transform: [], expose: [], exclude: null, type: null, flags: {} },
    });
    class ChildDup extends BaseDup {}
    setRaw(ChildDup, {
      f: { validation: [{ rule: sharedRule }], transform: [], expose: [], exclude: null, type: null, flags: {} },
    });
    // Act
    const merged = mergeInheritance(ChildDup);
    // Assert — deduplicated
    expect(merged.f!.validation.length).toBe(1);
  });

  // ── Object.hasOwn — prototype chain collection accuracy (H2) ─────────────────

  it('should not include child in chain when child has no own RAW (inherits via prototype)', () => {
    // Arrange
    class ParentNR {}
    setRaw(ParentNR, makeStringField('x'));
    class ChildNR extends ParentNR {}
    // ChildNR has NO own RAW — inherits ParentNR[RAW] via prototype chain
    // Act
    const merged = mergeInheritance(ChildNR);
    // Assert — parent field accessible, not double-merged
    expect(merged.x).toBeDefined();
    expect(merged.x!.validation.length).toBe(1);
  });

  it('should not double-merge parent rules when child inherits RAW via prototype', () => {
    // Arrange
    class BaseNR2 {}
    setRaw(BaseNR2, {
      name: { validation: [{ rule: isString }], transform: [], expose: [], exclude: null, type: null, flags: {} },
    });
    class ChildNR2 extends BaseNR2 {}
    // ChildNR2 has no own RAW — rule must appear exactly once
    // Act
    const merged = mergeInheritance(ChildNR2);
    // Assert
    expect(merged.name!.validation.length).toBe(1);
  });

  it('should skip intermediate class without own RAW in 3-level chain', () => {
    // Arrange
    class GrandNR {}
    setRaw(GrandNR, makeStringField('a'));
    class MidNR extends GrandNR {}
    // MidNR has no own RAW
    class ChildNR3 extends MidNR {}
    setRaw(ChildNR3, makeStringField('b'));
    // Act
    const merged = mergeInheritance(ChildNR3);
    // Assert — both fields present, each exactly once
    expect(merged.a).toBeDefined();
    expect(merged.b).toBeDefined();
    expect(merged.a!.validation.length).toBe(1);
    expect(merged.b!.validation.length).toBe(1);
  });

  it('should handle 3-level inheritance chain correctly', () => {
    // Arrange
    class GrandParent {}
    setRaw(GrandParent, {
      x: { validation: [{ rule: isString }], transform: [], expose: [], exclude: null, type: null, flags: {} },
    });
    class ParentLevel extends GrandParent {}
    setRaw(ParentLevel, {
      x: { validation: [{ rule: min(1) }], transform: [], expose: [], exclude: null, type: null, flags: {} },
    });
    class Child3 extends ParentLevel {}
    setRaw(Child3, {
      x: { validation: [{ rule: max(100) }], transform: [], expose: [], exclude: null, type: null, flags: {} },
    });
    // Act
    const merged = mergeInheritance(Child3);
    // Assert — all 3 rules in union
    expect(merged.x!.validation.length).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// sealOne — banned field names (prototype pollution prevention) (C5)
// ─────────────────────────────────────────────────────────────────────────────

/** Helper that adds a field named bannedKey as an own enumerable property to the RAW meta */
function makeRawWithBannedKey(bannedKey: string): RawClassMeta {
  const fieldMeta = { validation: [], transform: [], expose: [], exclude: null, type: null, flags: {} };
  const raw = Object.create(null) as RawClassMeta;
  Object.defineProperty(raw, bannedKey, {
    value: fieldMeta,
    enumerable: true,
    writable: true,
    configurable: true,
  });
  return raw;
}

describe('sealOne — banned field names (C5)', () => {
  it('should throw BakerError when a field is named __proto__', () => {
    // Arrange
    class BannedProtoDto {}
    setRaw(BannedProtoDto, makeRawWithBannedKey('__proto__'));
    // Act / Assert
    expect(() => sealClass(BannedProtoDto)).toThrow(BakerError);
  });

  it('should throw BakerError when a field is named constructor', () => {
    // Arrange
    class BannedConstructorDto {}
    const raw: RawClassMeta = Object.create(null) as RawClassMeta;
    raw['constructor'] = { validation: [], transform: [], expose: [], exclude: null, type: null, flags: {} };
    setRaw(BannedConstructorDto, raw);
    // Act / Assert
    expect(() => sealClass(BannedConstructorDto)).toThrow(BakerError);
  });

  it('should throw BakerError when a field is named prototype', () => {
    // Arrange
    class BannedPrototypeDto {}
    const raw: RawClassMeta = Object.create(null) as RawClassMeta;
    raw['prototype'] = { validation: [], transform: [], expose: [], exclude: null, type: null, flags: {} };
    setRaw(BannedPrototypeDto, raw);
    // Act / Assert
    expect(() => sealClass(BannedPrototypeDto)).toThrow(BakerError);
  });

  it('should throw BakerError even when banned field coexists with valid fields', () => {
    // Arrange — both a valid field ('name') and a banned field ('constructor')
    class MixedBannedDto {}
    const raw = Object.create(null) as RawClassMeta;
    Object.defineProperty(raw, 'name', {
      value: { validation: [{ rule: isString }], transform: [], expose: [], exclude: null, type: null, flags: {} },
      enumerable: true,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(raw, 'constructor', {
      value: { validation: [], transform: [], expose: [], exclude: null, type: null, flags: {} },
      enumerable: true,
      writable: true,
      configurable: true,
    });
    setRaw(MixedBannedDto, raw);
    // Act / Assert
    expect(() => sealClass(MixedBannedDto)).toThrow(BakerError);
  });

  it('should not throw BakerError for __PROTO__ (uppercase — not a banned name)', () => {
    // Arrange — same letters but different case, not a reserved name
    class UpperCaseDto {}
    setRaw(UpperCaseDto, makeRawWithBannedKey('__PROTO__'));
    // Act / Assert
    expect(() => sealClass(UpperCaseDto)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E-2: analyzeAsync discriminator circular (→ C-1)
// ─────────────────────────────────────────────────────────────────────────────

describe('analyzeAsync — discriminator', () => {
  it('should detect async transform in discriminator subType', () => {
    // Arrange — SubA has an async transform
    class SubA {}
    const asyncFn = async ({ value }: { value: unknown }): Promise<unknown> => value;
    setRaw(SubA, {
      val: {
        validation: [{ rule: isString }],
        transform: [{ fn: asyncFn }],
        expose: [],
        exclude: null,
        type: null,
        flags: {},
      },
    });

    class SubB {}
    setRaw(SubB, makeStringField('val'));

    class ParentDisc {}
    setRaw(ParentDisc, {
      child: {
        validation: [],
        transform: [],
        expose: [],
        exclude: null,
        type: {
          fn: () => SubA,
          discriminator: {
            property: 'kind',
            subTypes: [
              { name: 'a', value: SubA },
              { name: 'b', value: SubB },
            ],
          },
        },
        flags: { validateNested: true },
      },
    });

    // Act
    const b = sealClass(ParentDisc);

    // Assert — executor decides async statically; SubA's async transform makes
    // the whole deserialize path async, so a valid input returns a Promise.
    expect(b.deserialize(ParentDisc, { child: { kind: 'a', val: 's' } })).toBeInstanceOf(Promise);
  });

  it('should not infinite loop when discriminator subTypes reference each other circularly', () => {
    // Arrange — SubA references SubB, SubB references SubA via nested type
    class CircSubA {}
    class CircSubB {}

    setRaw(CircSubA, {
      name: { validation: [{ rule: isString }], transform: [], expose: [], exclude: null, type: null, flags: {} },
      other: {
        validation: [],
        transform: [],
        expose: [],
        exclude: null,
        type: { fn: () => CircSubB },
        flags: { validateNested: true },
      },
    });
    setRaw(CircSubB, {
      name: { validation: [{ rule: isString }], transform: [], expose: [], exclude: null, type: null, flags: {} },
      other: {
        validation: [],
        transform: [],
        expose: [],
        exclude: null,
        type: { fn: () => CircSubA },
        flags: { validateNested: true },
      },
    });

    class CircParent {}
    setRaw(CircParent, {
      child: {
        validation: [],
        transform: [],
        expose: [],
        exclude: null,
        type: {
          fn: () => CircSubA,
          discriminator: {
            property: 'kind',
            subTypes: [
              { name: 'a', value: CircSubA },
              { name: 'b', value: CircSubB },
            ],
          },
        },
        flags: { validateNested: true },
      },
    });

    // Act / Assert — should not throw or infinite loop
    let b!: ReturnType<typeof sealClass>;
    expect(() => {
      b = sealClass(CircParent);
    }).not.toThrow();
    expect(() => b.deserialize(CircParent, {})).not.toThrow();
  });

  // ── E-14: 3 discriminator subTypes A→B→C→A circular — analyzeAsync terminates ──

  it('should terminate normally with 3 discriminator subTypes in A→B→C→A circular chain', () => {
    // Arrange — A uses discriminator with subTypes [B, C], B→C, C→A (full cycle)
    class DiscA {}
    class DiscB {}
    class DiscC {}

    setRaw(DiscB, {
      name: { validation: [{ rule: isString }], transform: [], expose: [], exclude: null, type: null, flags: {} },
      ref: {
        validation: [],
        transform: [],
        expose: [],
        exclude: null,
        type: { fn: () => DiscC },
        flags: { validateNested: true },
      },
    });
    setRaw(DiscC, {
      name: { validation: [{ rule: isString }], transform: [], expose: [], exclude: null, type: null, flags: {} },
      ref: {
        validation: [],
        transform: [],
        expose: [],
        exclude: null,
        type: { fn: () => DiscA },
        flags: { validateNested: true },
      },
    });
    setRaw(DiscA, {
      child: {
        validation: [],
        transform: [],
        expose: [],
        exclude: null,
        type: {
          fn: () => DiscB,
          discriminator: {
            property: 'kind',
            subTypes: [
              { name: 'b', value: DiscB },
              { name: 'c', value: DiscC },
            ],
          },
        },
        flags: { validateNested: true },
      },
    });

    // Act / Assert — should not throw or infinite loop (visited Set shared across recursion)
    let b!: ReturnType<typeof sealClass>;
    expect(() => {
      b = sealClass(DiscA);
    }).not.toThrow();
    expect(() => b.deserialize(DiscA, {})).not.toThrow();
    expect(() => b.deserialize(DiscB, { name: 'x' })).not.toThrow();
    expect(() => b.deserialize(DiscC, { name: 'x' })).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// circularPlaceholder — the temporary executor parked in the baker's executor map while a class is mid-seal.
// Its methods must never run in normal flow (they are replaced in-place once seal completes), so
// they exist purely as guards: if anything invokes them, it means a class was used while still
// being sealed, which must fail loudly rather than run a half-built executor.
// ─────────────────────────────────────────────────────────────────────────────

describe('circularPlaceholder', () => {
  it('returns an executor whose deserialize/serialize/validate all throw BakerError', () => {
    const ph = circularPlaceholder('PendingDto');
    expect(() => ph.deserialize({}, undefined)).toThrow(BakerError);
    expect(() => ph.serialize({}, undefined)).toThrow(BakerError);
    expect(() => ph.validate({}, undefined)).toThrow(BakerError);
  });

  it('names the still-sealing class in the thrown message', () => {
    const ph = circularPlaceholder('PendingDto');
    expect(() => ph.deserialize({}, undefined)).toThrow(/PendingDto is still being sealed/);
  });

  it('is marked synchronous (isAsync / isSerializeAsync both false)', () => {
    const ph = circularPlaceholder('PendingDto');
    expect(ph.isAsync).toBe(false);
    expect(ph.isSerializeAsync).toBe(false);
  });
});
