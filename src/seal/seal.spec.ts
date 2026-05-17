import { describe, it, expect, afterEach, spyOn } from 'bun:test';

import type { RawClassMeta, RuleDef, SealedExecutors } from '../types';

import { SealError } from '../errors';
import { globalRegistry } from '../registry';
import { min, max } from '../rules/number';
import { isString } from '../rules/typechecker';
import { seal, resetForTesting, __testing__ } from './seal';
import { getSealed, setSealed, deleteSealed, getRaw, setRaw, deleteRaw, requireSealed } from '../meta-access';

const { mergeInheritance, circularPlaceholder } = __testing__;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const freeClasses: Function[] = [];

function registerClass(ctor: Function, raw?: RawClassMeta): void {
  if (raw !== undefined) {
    setRaw(ctor, raw);
  }
  globalRegistry.add(ctor);
  freeClasses.push(ctor);
}

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
// Cleanup
// ─────────────────────────────────────────────────────────────────────────────

afterEach(() => {
  for (const ctor of freeClasses) {
    globalRegistry.delete(ctor);
    deleteSealed(ctor);
    deleteRaw(ctor);
  }
  freeClasses.length = 0;
  resetForTesting();
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('seal', () => {
  // ── Happy Path ─────────────────────────────────────────────────────────────

  it('should succeed on empty registry', () => {
    // Arrange — no classes registered (freeClasses empty)
    // Act / Assert
    expect(() => seal()).not.toThrow();
  });

  it('should set the SEALED symbol on the class after sealing', () => {
    // Arrange
    class UserDto {}
    registerClass(UserDto, makeStringField('name'));
    // Act
    seal();
    // Assert
    const sealed = requireSealed(UserDto);
    expect(sealed).toBeDefined();
    expect(typeof sealed.deserialize).toBe('function');
    expect(typeof sealed.serialize).toBe('function');
  });

  it('should expose resetForTesting to reset _sealed flag', () => {
    // Arrange
    class TestDto {}
    registerClass(TestDto, makeStringField('x'));
    seal();
    expect(getSealed(TestDto)).toBeDefined();
    // After reset, new classes should be batch-sealable again
    deleteSealed(TestDto);
    globalRegistry.add(TestDto);
    resetForTesting();
    seal();
    expect(getSealed(TestDto)).toBeDefined();
  });

  it('should seal a DTO with @IsString field — deserialize returns instance for valid input', async () => {
    // Arrange
    class PersonDto {}
    registerClass(PersonDto, makeStringField('name'));
    seal();
    // Act
    const sealed = requireSealed(PersonDto);
    const result = await sealed.deserialize({ name: 'Alice' });
    // Assert
    expect(result).toBeInstanceOf(PersonDto);
    // @ts-ignore
    expect(result.name).toBe('Alice');
  });

  it('should seal a DTO with @IsString field — deserialize returns error for invalid input', async () => {
    // Arrange
    class PersonDto2 {}
    registerClass(PersonDto2, makeStringField('name'));
    seal();
    // Act
    const sealed = requireSealed(PersonDto2);
    const result = await sealed.deserialize({ name: 42 });
    // Assert — should be Err (has .data property)
    expect((result as any).data).toBeDefined();
    expect(Array.isArray((result as any).data)).toBe(true);
  });

  it('should seal @Type nested DTO so nested class is also sealed', () => {
    // Arrange
    class AddressDto {}
    setRaw(AddressDto, makeStringField('city'));
    globalRegistry.add(AddressDto);
    freeClasses.push(AddressDto);

    class OrderDto {}
    registerClass(OrderDto, {
      address: {
        validation: [],
        transform: [],
        expose: [],
        exclude: null,
        type: { fn: () => AddressDto as any },
        flags: { validateNested: true },
      },
    });
    // Act
    seal();
    // Assert — nested DTO also sealed
    expect(getSealed(AddressDto)).toBeDefined();
  });

  it('should skip sealOne if class is already SEALED (prevents double-seal)', () => {
    // Arrange
    class DtoA {}
    const raw = makeStringField('x');
    registerClass(DtoA, raw);
    // Pre-seal DtoA with a sentinel executor; verify seal() preserves it by reference equality
    const sentinel: SealedExecutors<unknown> = {
      deserialize: () => ({ ok: true } as never),
      serialize: () => ({ tag: 'pre-sealed' }),
      validate: () => null,
      isAsync: false,
      isSerializeAsync: false,
    };
    setSealed(DtoA, sentinel);
    seal();
    // Assert — SEALED slot was not replaced (reference identity)
    expect(requireSealed(DtoA)).toBe(sentinel);
  });

  // ── Idempotency ────────────────────────────────────────────────────────────

  it('should be idempotent — second call is a no-op', () => {
    class Dto1 {}
    registerClass(Dto1, makeStringField('a'));
    seal();
    expect(getSealed(Dto1)).toBeDefined();
    // Second call should not throw
    expect(() => seal()).not.toThrow();
  });

  // ── seal ──────────────────────────────────────────────────────────

  it('should seal individual class on demand after batch seal', () => {
    seal(); // batch seal with empty registry
    // Register a new class after batch seal
    class LateDto {}
    registerClass(LateDto, makeStringField('name'));
    // seal won't seal it (already sealed=true)
    seal();
    expect(getSealed(LateDto)).toBeUndefined();
    // seal seals it individually
    seal(LateDto);
    expect(getSealed(LateDto)).toBeDefined();
  });

  // ── Negative / Error ───────────────────────────────────────────────────────

  it('should throw SealError when @Expose has both deserializeOnly and serializeOnly', () => {
    // Arrange
    class BadExposeDto {}
    registerClass(BadExposeDto, {
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
    expect(() => seal()).toThrow(SealError);
  });

  // ── State Transition ───────────────────────────────────────────────────────

  it('should allow seal() after resetForTesting() (state transition)', () => {
    // Arrange
    seal();
    resetForTesting();
    // Act / Assert
    expect(() => seal()).not.toThrow();
  });

  it('should allow re-sealing after SEALED symbols are cleared and resetForTesting called', () => {
    // Arrange
    class DtoB {}
    registerClass(DtoB, makeStringField('val'));
    seal();
    // Simulate unseal — restore RAW from merged, re-register
    const sealed = requireSealed(DtoB);
    if (sealed?.merged) {setRaw(DtoB, sealed.merged);}
    deleteSealed(DtoB);
    globalRegistry.add(DtoB);
    freeClasses.push(DtoB);
    resetForTesting();
    // Act
    seal();
    // Assert
    expect(getSealed(DtoB)).toBeDefined();
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
        type: { fn: () => TreeDto as any },
        flags: { validateNested: true },
      },
    });
    globalRegistry.add(TreeDto);
    freeClasses.push(TreeDto);
    // Act / Assert — should not throw or infinite loop
    expect(() => seal()).not.toThrow();
  });

  // ── Edge ───────────────────────────────────────────────────────────────────

  it('should succeed when DTO has no fields (empty metadata)', () => {
    // Arrange
    class EmptyDto {}
    registerClass(EmptyDto, makeEmptyMeta());
    // Act / Assert
    expect(() => seal()).not.toThrow();
    expect(getSealed(EmptyDto)).toBeDefined();
  });

  it('should not seal a class not in globalRegistry', () => {
    // Arrange — NotRegisteredDto NOT added to globalRegistry
    class NotRegisteredDto {}
    setRaw(NotRegisteredDto, makeStringField('x'));
    // (not added to freeClasses or globalRegistry)
    seal();
    // Assert
    expect(getSealed(NotRegisteredDto)).toBeUndefined();
  });

  // ── Idempotency ────────────────────────────────────────────────────────────

  it('should produce equivalent executors after seal → unseal → seal cycle', async () => {
    // Arrange
    class IdempDto {}
    registerClass(IdempDto, makeStringField('name'));
    seal();
    const first = requireSealed(IdempDto);
    const firstResult = await first.deserialize({ name: 'Bob' });

    // Simulate unseal — restore RAW from merged, re-register
    const sealed = requireSealed(IdempDto);
    if (sealed?.merged) {setRaw(IdempDto, sealed.merged);}
    deleteSealed(IdempDto);
    globalRegistry.add(IdempDto);
    freeClasses.push(IdempDto);
    resetForTesting();
    seal();
    const second = requireSealed(IdempDto);
    const secondResult = await second.deserialize({ name: 'Bob' });
    // Assert — both produce instances with same values
    expect(firstResult).toBeInstanceOf(IdempDto);
    expect(secondResult).toBeInstanceOf(IdempDto);
    // @ts-ignore
    expect(firstResult.name).toBe(secondResult.name);
  });

  it('should recursively seal discriminator subType classes (L106-108)', () => {
    // Arrange — parent DTO with a polymorphic discriminator field
    class DogDto {}
    class CatDto {}
    registerClass(DogDto, makeEmptyMeta());
    registerClass(CatDto, makeEmptyMeta());

    class AnimalContainerDto {}
    const raw: RawClassMeta = {
      animal: {
        validation: [],
        transform: [],
        expose: [],
        exclude: null,
        type: {
          fn: () => DogDto as any,
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
    registerClass(AnimalContainerDto, raw);

    // Act
    seal();

    // Assert — both subtype classes must be sealed by the recursive call
    expect(getSealed(DogDto)).toBeDefined();
    expect(getSealed(CatDto)).toBeDefined();
    expect(getSealed(AnimalContainerDto)).toBeDefined();
  });

  // ── DX-5: @Type without @ValidateNested warning ────────────────────────────

  it('should auto-set validateNested when @Type points to a DTO class (replaces DX-5 warning)', () => {
    // Arrange
    class NestedTarget {}
    registerClass(NestedTarget, makeEmptyMeta());

    class AutoNestedDto {}
    registerClass(AutoNestedDto, {
      nested: {
        validation: [],
        transform: [],
        expose: [],
        exclude: null,
        type: { fn: () => NestedTarget as any },
        flags: {}, // no validateNested — seal should auto-set it
      },
    });
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    // Act
    seal();
    // Assert — no warning, nested DTO is auto-resolved
    expect(warnSpy).not.toHaveBeenCalled();
    expect(getSealed(AutoNestedDto)).toBeDefined();
    warnSpy.mockRestore();
  });

  // ── Cleanup of placeholders when seal fails ──────────────────────────

  it('should clean up recursively-sealed nested DTOs in seal', () => {
    // Arrange — batch seal first (empty), then register parent+nested after
    seal(); // sets _sealed=true

    class NestedLate {}
    setRaw(NestedLate, makeStringField('val'));
    globalRegistry.add(NestedLate);
    freeClasses.push(NestedLate);

    class ParentLate {}
    setRaw(ParentLate, {
      child: {
        validation: [],
        transform: [],
        expose: [],
        exclude: null,
        type: { fn: () => NestedLate as any },
        flags: {},
      },
    });
    globalRegistry.add(ParentLate);
    freeClasses.push(ParentLate);

    // Act — seal should seal ParentLate AND recursively seal NestedLate
    seal(ParentLate);

    // Assert — both sealed, RAW frozen, removed from registry
    expect(getSealed(ParentLate)).toBeDefined();
    expect(getSealed(NestedLate)).toBeDefined();
    expect(Object.isFrozen(getRaw(ParentLate))).toBe(true);
    expect(Object.isFrozen(getRaw(NestedLate))).toBe(true);
    expect(globalRegistry.has(ParentLate)).toBe(false);
    expect(globalRegistry.has(NestedLate)).toBe(false);
  });

  it('should throw SealError when @Type returns invalid value (null/non-function)', () => {
    // Arrange
    class BadTypeDto {}
    registerClass(BadTypeDto, {
      field: {
        validation: [],
        transform: [],
        expose: [],
        exclude: null,
        type: { fn: () => null as any },
        flags: {},
      },
    });
    // Act / Assert
    expect(() => seal()).toThrow(SealError);
  });

  it('should clean up stale placeholders when seal fails', () => {
    // Arrange — nested DTO has banned field name 'constructor' → SealError
    class BrokenNested {}
    setRaw(BrokenNested, {
      constructor: { validation: [], transform: [], expose: [], exclude: null, type: null, flags: {} },
    } as unknown as RawClassMeta);
    freeClasses.push(BrokenNested);

    class ParentDto {}
    registerClass(ParentDto, {
      child: {
        validation: [],
        transform: [],
        expose: [],
        exclude: null,
        type: { fn: () => BrokenNested as any },
        flags: { validateNested: true },
      },
    });
    // Act — seal fails
    expect(() => seal()).toThrow(SealError);
    // Assert — stale placeholder cleaned up
    expect(getSealed(ParentDto)).toBeUndefined();
  });

  // ── DX-5 transform filter callback coverage (seal.ts#L110) ──────────────────

  it('should auto-set validateNested even when @Type field has serializeOnly-only transforms', () => {
    // Arrange — transform has serializeOnly, @Type points to DTO → auto nested
    class NestedA {}
    registerClass(NestedA, makeEmptyMeta());

    class AutoNestedTransformDto {}
    registerClass(AutoNestedTransformDto, {
      nested: {
        validation: [],
        transform: [{ fn: () => 'x', options: { serializeOnly: true } }],
        expose: [],
        exclude: null,
        type: { fn: () => NestedA as any },
        flags: {}, // no validateNested — seal should auto-set it
      },
    });
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    // Act
    seal();
    // Assert — no warning, nested DTO is auto-resolved
    expect(warnSpy).not.toHaveBeenCalled();
    expect(getSealed(AutoNestedTransformDto)).toBeDefined();
    warnSpy.mockRestore();
  });

  it('should invoke transform.filter callback and skip warn when @Type field has bidirectional transform', () => {
    // Arrange — bidirectional transform → filter returns true → length=1 → no warn
    class NestedB {}
    registerClass(NestedB, makeEmptyMeta());

    class NoWarnTransformDto {}
    registerClass(NoWarnTransformDto, {
      nested: {
        validation: [],
        transform: [{ fn: () => 'x' }],
        expose: [],
        exclude: null,
        type: { fn: () => NestedB as any },
        flags: {}, // no validateNested
      },
    });
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    // Act
    seal();
    // Assert — no warn because there IS a deserialize-direction transform
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mergeInheritance — using __testing__ export
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
    const parentFn = (v: any) => v.trim();
    (parentFn as any).emit = () => '';
    (parentFn as any).ruleName = 'trim';

    const childFn = (v: any) => v.toLowerCase();
    (childFn as any).emit = () => '';
    (childFn as any).ruleName = 'lower';

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
    const parentFn2 = (v: any) => v;
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
// C5: sealOne — banned field names (prototype pollution prevention)
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
  it('should throw SealError when a field is named __proto__', () => {
    // Arrange
    class BannedProtoDto {}
    registerClass(BannedProtoDto, makeRawWithBannedKey('__proto__'));
    // Act / Assert
    expect(() => seal()).toThrow(SealError);
  });

  it('should throw SealError when a field is named constructor', () => {
    // Arrange
    class BannedConstructorDto {}
    const raw = {
      constructor: { validation: [], transform: [], expose: [], exclude: null, type: null, flags: {} },
    } as unknown as RawClassMeta;
    registerClass(BannedConstructorDto, raw);
    // Act / Assert
    expect(() => seal()).toThrow(SealError);
  });

  it('should throw SealError when a field is named prototype', () => {
    // Arrange
    class BannedPrototypeDto {}
    const raw = {
      prototype: { validation: [], transform: [], expose: [], exclude: null, type: null, flags: {} },
    } as unknown as RawClassMeta;
    registerClass(BannedPrototypeDto, raw);
    // Act / Assert
    expect(() => seal()).toThrow(SealError);
  });

  it('should throw SealError even when banned field coexists with valid fields', () => {
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
    registerClass(MixedBannedDto, raw);
    // Act / Assert
    expect(() => seal()).toThrow(SealError);
  });

  it('should not throw SealError for __PROTO__ (uppercase — not a banned name)', () => {
    // Arrange — same letters but different case, not a reserved name
    class UpperCaseDto {}
    registerClass(UpperCaseDto, makeRawWithBannedKey('__PROTO__'));
    // Act / Assert
    expect(() => seal()).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// circularPlaceholder — placeholder executor behavior verification
// ─────────────────────────────────────────────────────────────────────────────

describe('circularPlaceholder', () => {
  it('should return placeholder that throws SealError on deserialize and serialize', () => {
    const p = circularPlaceholder('TestDto');
    expect(() => p.deserialize({})).toThrow(SealError);
    expect(() => p.serialize({})).toThrow(SealError);
    expect(p.isAsync).toBe(false);
    expect(p.isSerializeAsync).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E-2: analyzeAsync discriminator circular (→ C-1)
// ─────────────────────────────────────────────────────────────────────────────

describe('analyzeAsync — discriminator', () => {
  it('should detect async transform in discriminator subType', () => {
    // Arrange — SubA has an async transform
    class SubA {}
    const asyncFn = async (v: any) => v;
    registerClass(SubA, {
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
    registerClass(SubB, makeStringField('val'));

    class ParentDisc {}
    registerClass(ParentDisc, {
      child: {
        validation: [],
        transform: [],
        expose: [],
        exclude: null,
        type: {
          fn: () => SubA as any,
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
    seal();

    // Assert — sealed executor should be async due to SubA's async transform
    const sealed = requireSealed(ParentDisc);
    expect(sealed).toBeDefined();
    expect(sealed.isAsync).toBe(true);
  });

  it('should not infinite loop when discriminator subTypes reference each other circularly', () => {
    // Arrange — SubA references SubB, SubB references SubA via nested type
    class CircSubA {}
    class CircSubB {}

    registerClass(CircSubA, {
      name: { validation: [{ rule: isString }], transform: [], expose: [], exclude: null, type: null, flags: {} },
      other: {
        validation: [],
        transform: [],
        expose: [],
        exclude: null,
        type: { fn: () => CircSubB as any },
        flags: { validateNested: true },
      },
    });
    registerClass(CircSubB, {
      name: { validation: [{ rule: isString }], transform: [], expose: [], exclude: null, type: null, flags: {} },
      other: {
        validation: [],
        transform: [],
        expose: [],
        exclude: null,
        type: { fn: () => CircSubA as any },
        flags: { validateNested: true },
      },
    });

    class CircParent {}
    registerClass(CircParent, {
      child: {
        validation: [],
        transform: [],
        expose: [],
        exclude: null,
        type: {
          fn: () => CircSubA as any,
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
    expect(() => seal()).not.toThrow();
    expect(getSealed(CircParent)).toBeDefined();
  });

  // ── E-14: 3 discriminator subTypes A→B→C→A circular — analyzeAsync terminates ──

  it('should terminate normally with 3 discriminator subTypes in A→B→C→A circular chain', () => {
    // Arrange — A uses discriminator with subTypes [B, C], B→C, C→A (full cycle)
    class DiscA {}
    class DiscB {}
    class DiscC {}

    registerClass(DiscB, {
      name: { validation: [{ rule: isString }], transform: [], expose: [], exclude: null, type: null, flags: {} },
      ref: {
        validation: [],
        transform: [],
        expose: [],
        exclude: null,
        type: { fn: () => DiscC as any },
        flags: { validateNested: true },
      },
    });
    registerClass(DiscC, {
      name: { validation: [{ rule: isString }], transform: [], expose: [], exclude: null, type: null, flags: {} },
      ref: {
        validation: [],
        transform: [],
        expose: [],
        exclude: null,
        type: { fn: () => DiscA as any },
        flags: { validateNested: true },
      },
    });
    registerClass(DiscA, {
      child: {
        validation: [],
        transform: [],
        expose: [],
        exclude: null,
        type: {
          fn: () => DiscB as any,
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
    expect(() => seal()).not.toThrow();
    expect(getSealed(DiscA)).toBeDefined();
    expect(getSealed(DiscB)).toBeDefined();
    expect(getSealed(DiscC)).toBeDefined();
  });
});
