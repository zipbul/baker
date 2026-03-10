import { describe, it, expect, afterEach, beforeEach, spyOn } from 'bun:test';
import { _autoSeal, _sealOnDemand, _resetForTesting, __testing__ } from './seal';
import { SealError } from '../errors';
import { RAW, SEALED } from '../symbols';
import { globalRegistry } from '../registry';
import { isString } from '../rules/typechecker';
import { isNumber } from '../rules/typechecker';
import { min, max } from '../rules/number';
import type { RawClassMeta, RuleDef } from '../types';

const { mergeInheritance } = __testing__;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const freeClasses: Function[] = [];

function registerClass(ctor: Function, raw?: RawClassMeta): void {
  if (raw !== undefined) {
    (ctor as any)[RAW] = raw;
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
      schema: null,
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
    delete (ctor as any)[SEALED];
    delete (ctor as any)[RAW];
  }
  freeClasses.length = 0;
  _resetForTesting();
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('_autoSeal', () => {
  // ── Happy Path ─────────────────────────────────────────────────────────────

  it('should succeed on empty registry', () => {
    // Arrange — no classes registered (freeClasses empty)
    // Act / Assert
    expect(() => _autoSeal()).not.toThrow();
  });

  it('should set the SEALED symbol on the class after sealing', () => {
    // Arrange
    class UserDto {}
    registerClass(UserDto, makeStringField('name'));
    // Act
    _autoSeal();
    // Assert
    const sealed = (UserDto as any)[SEALED];
    expect(sealed).toBeDefined();
    expect(typeof sealed._deserialize).toBe('function');
    expect(typeof sealed._serialize).toBe('function');
  });

  it('should expose _resetForTesting to reset _sealed flag', () => {
    // Arrange
    class TestDto {}
    registerClass(TestDto, makeStringField('x'));
    _autoSeal();
    expect((TestDto as any)[SEALED]).toBeDefined();
    // After reset, new classes should be batch-sealable again
    delete (TestDto as any)[SEALED];
    globalRegistry.add(TestDto);
    _resetForTesting();
    _autoSeal();
    expect((TestDto as any)[SEALED]).toBeDefined();
  });

  it('should seal a DTO with @IsString field — _deserialize returns instance for valid input', async () => {
    // Arrange
    class PersonDto {}
    registerClass(PersonDto, makeStringField('name'));
    _autoSeal();
    // Act
    const sealed = (PersonDto as any)[SEALED];
    const result = await sealed._deserialize({ name: 'Alice' });
    // Assert
    expect(result).toBeInstanceOf(PersonDto);
    // @ts-ignore
    expect(result.name).toBe('Alice');
  });

  it('should seal a DTO with @IsString field — _deserialize returns error for invalid input', async () => {
    // Arrange
    class PersonDto2 {}
    registerClass(PersonDto2, makeStringField('name'));
    _autoSeal();
    // Act
    const sealed = (PersonDto2 as any)[SEALED];
    const result = await sealed._deserialize({ name: 42 });
    // Assert — should be Err (has .data property)
    expect((result as any).data).toBeDefined();
    expect(Array.isArray((result as any).data)).toBe(true);
  });

  it('should seal @Type nested DTO so nested class is also sealed', () => {
    // Arrange
    class AddressDto {}
    (AddressDto as any)[RAW] = makeStringField('city');
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
        schema: null,
      },
    });
    // Act
    _autoSeal();
    // Assert — nested DTO also sealed
    expect((AddressDto as any)[SEALED]).toBeDefined();
  });

  it('should skip sealOne if class is already SEALED (prevents double-seal)', () => {
    // Arrange
    class DtoA {}
    const raw = makeStringField('x');
    registerClass(DtoA, raw);
    // Pre-seal DtoA
    (DtoA as any)[SEALED] = {
      _deserialize: () => 'pre-sealed',
      _serialize: () => ({}),
    };
    _autoSeal();
    // Assert — SEALED was not replaced (pre-sealed value preserved)
    const sealed = (DtoA as any)[SEALED];
    expect(sealed._deserialize()).toBe('pre-sealed');
  });

  // ── Idempotency ────────────────────────────────────────────────────────────

  it('should be idempotent — second call is a no-op', () => {
    class Dto1 {}
    registerClass(Dto1, makeStringField('a'));
    _autoSeal();
    expect((Dto1 as any)[SEALED]).toBeDefined();
    // Second call should not throw
    expect(() => _autoSeal()).not.toThrow();
  });

  // ── _sealOnDemand ──────────────────────────────────────────────────────────

  it('should seal individual class on demand after batch seal', () => {
    _autoSeal(); // batch seal with empty registry
    // Register a new class after batch seal
    class LateDto {}
    registerClass(LateDto, makeStringField('name'));
    // _autoSeal won't seal it (already sealed=true)
    _autoSeal();
    expect((LateDto as any)[SEALED]).toBeUndefined();
    // _sealOnDemand seals it individually
    _sealOnDemand(LateDto);
    expect((LateDto as any)[SEALED]).toBeDefined();
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
        schema: null,
      },
    });
    // Act / Assert
    expect(() => _autoSeal()).toThrow(SealError);
  });

  // ── State Transition ───────────────────────────────────────────────────────

  it('should allow _autoSeal() after _resetForTesting() (state transition)', () => {
    // Arrange
    _autoSeal();
    _resetForTesting();
    // Act / Assert
    expect(() => _autoSeal()).not.toThrow();
  });

  it('should allow re-sealing after SEALED symbols are cleared and _resetForTesting called', () => {
    // Arrange
    class DtoB {}
    registerClass(DtoB, makeStringField('val'));
    _autoSeal();
    // Simulate unseal — restore RAW from _merged, re-register
    const sealed = (DtoB as any)[SEALED];
    if (sealed?._merged) (DtoB as any)[RAW] = sealed._merged;
    delete (DtoB as any)[SEALED];
    globalRegistry.add(DtoB);
    freeClasses.push(DtoB);
    _resetForTesting();
    // Act
    _autoSeal();
    // Assert
    expect((DtoB as any)[SEALED]).toBeDefined();
  });

  // ── Corner ─────────────────────────────────────────────────────────────────

  it('should handle circular @Type via placeholder without infinite recursion', () => {
    // Arrange — self-referencing DTO
    class TreeDto {}
    (TreeDto as any)[RAW] = {
      value: { validation: [{ rule: isString }], transform: [], expose: [], exclude: null, type: null, flags: {}, schema: null },
      child: {
        validation: [],
        transform: [],
        expose: [],
        exclude: null,
        type: { fn: () => TreeDto as any },
        flags: { validateNested: true },
        schema: null,
      },
    };
    globalRegistry.add(TreeDto);
    freeClasses.push(TreeDto);
    // Act / Assert — should not throw or infinite loop
    expect(() => _autoSeal()).not.toThrow();
  });

  // ── Edge ───────────────────────────────────────────────────────────────────

  it('should succeed when DTO has no fields (empty metadata)', () => {
    // Arrange
    class EmptyDto {}
    registerClass(EmptyDto, makeEmptyMeta());
    // Act / Assert
    expect(() => _autoSeal()).not.toThrow();
    expect((EmptyDto as any)[SEALED]).toBeDefined();
  });

  it('should not seal a class not in globalRegistry', () => {
    // Arrange — NotRegisteredDto NOT added to globalRegistry
    class NotRegisteredDto {}
    (NotRegisteredDto as any)[RAW] = makeStringField('x');
    // (not added to freeClasses or globalRegistry)
    _autoSeal();
    // Assert
    expect((NotRegisteredDto as any)[SEALED]).toBeUndefined();
  });

  // ── Idempotency ────────────────────────────────────────────────────────────

  it('should produce equivalent executors after seal → unseal → seal cycle', async () => {
    // Arrange
    class IdempDto {}
    registerClass(IdempDto, makeStringField('name'));
    _autoSeal();
    const first = (IdempDto as any)[SEALED];
    const firstResult = await first._deserialize({ name: 'Bob' });

    // Simulate unseal — restore RAW from _merged, re-register
    const sealed = (IdempDto as any)[SEALED];
    if (sealed?._merged) (IdempDto as any)[RAW] = sealed._merged;
    delete (IdempDto as any)[SEALED];
    globalRegistry.add(IdempDto);
    freeClasses.push(IdempDto);
    _resetForTesting();
    _autoSeal();
    const second = (IdempDto as any)[SEALED];
    const secondResult = await second._deserialize({ name: 'Bob' });
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
        schema: null,
      },
    };
    registerClass(AnimalContainerDto, raw);

    // Act
    _autoSeal();

    // Assert — both subtype classes must be sealed by the recursive call
    expect((DogDto as any)[SEALED]).toBeDefined();
    expect((CatDto as any)[SEALED]).toBeDefined();
    expect((AnimalContainerDto as any)[SEALED]).toBeDefined();
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
        schema: null,
      },
    });
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    // Act
    _autoSeal();
    // Assert — no warning, nested DTO is auto-resolved
    expect(warnSpy).not.toHaveBeenCalled();
    expect((AutoNestedDto as any)[SEALED]).toBeDefined();
    warnSpy.mockRestore();
  });

  // ── Placeholder arrow coverage (seal.ts#L88-89) ──────────────────────────

  it('should throw "seal in progress" from placeholder _deserialize when nested DTO seal fails', () => {
    // Arrange — nested DTO has banned field name 'constructor' → SealError during sealOne
    // NOT registered in globalRegistry so ParentDto's sealOne triggers it via @Type
    class BrokenNested {}
    (BrokenNested as any)[RAW] = { constructor: { validation: [], transform: [], expose: [], exclude: null, type: null, flags: {}, schema: null } } as unknown as RawClassMeta;
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
        schema: null,
      },
    });
    // Act — seal fails mid-process; ParentDto gets placeholder before nested DTO throws
    expect(() => _autoSeal()).toThrow(SealError);
    // Assert — ParentDto's SEALED still has the placeholder _deserialize
    const sealed = (ParentDto as any)[SEALED];
    expect(sealed).toBeDefined();
    expect(() => sealed._deserialize()).toThrow('seal in progress');
  });

  it('should throw "seal in progress" from placeholder _serialize when nested DTO seal fails', () => {
    // Arrange
    class BrokenNested2 {}
    (BrokenNested2 as any)[RAW] = { constructor: { validation: [], transform: [], expose: [], exclude: null, type: null, flags: {}, schema: null } } as unknown as RawClassMeta;
    freeClasses.push(BrokenNested2);

    class ParentDto2 {}
    registerClass(ParentDto2, {
      item: {
        validation: [],
        transform: [],
        expose: [],
        exclude: null,
        type: { fn: () => BrokenNested2 as any },
        flags: { validateNested: true },
        schema: null,
      },
    });
    // Act
    expect(() => _autoSeal()).toThrow(SealError);
    // Assert — placeholder _serialize throws
    const sealed = (ParentDto2 as any)[SEALED];
    expect(sealed).toBeDefined();
    expect(() => sealed._serialize()).toThrow('seal in progress');
  });

  it('should retain placeholder on SEALED when sealOne encounters error mid-process', () => {
    // Arrange
    class BrokenNested3 {}
    (BrokenNested3 as any)[RAW] = { constructor: { validation: [], transform: [], expose: [], exclude: null, type: null, flags: {}, schema: null } } as unknown as RawClassMeta;
    freeClasses.push(BrokenNested3);

    class ParentDto3 {}
    registerClass(ParentDto3, {
      ref: {
        validation: [],
        transform: [],
        expose: [],
        exclude: null,
        type: { fn: () => BrokenNested3 as any },
        flags: { validateNested: true },
        schema: null,
      },
    });
    // Act
    expect(() => _autoSeal()).toThrow(SealError);
    // Assert — placeholder retained with _isAsync=false and _isSerializeAsync=false
    const sealed = (ParentDto3 as any)[SEALED];
    expect(sealed._isAsync).toBe(false);
    expect(sealed._isSerializeAsync).toBe(false);
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
        schema: null,
      },
    });
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    // Act
    _autoSeal();
    // Assert — no warning, nested DTO is auto-resolved
    expect(warnSpy).not.toHaveBeenCalled();
    expect((AutoNestedTransformDto as any)[SEALED]).toBeDefined();
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
        schema: null,
      },
    });
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    // Act
    _autoSeal();
    // Assert — no warn because there IS a deserialize-direction transform
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mergeInheritance — __testing__ export 사용
// ─────────────────────────────────────────────────────────────────────────────

describe('mergeInheritance', () => {
  it('should return own RAW only when class has no parent with RAW', () => {
    // Arrange
    class StandaloneDto {}
    const raw = makeStringField('name');
    (StandaloneDto as any)[RAW] = raw;
    // Act
    const merged = mergeInheritance(StandaloneDto);
    // Assert
    expect(merged.name).toBeDefined();
    expect(merged.name!.validation.length).toBe(1);
  });

  it('should union-merge validation rules from parent and child', () => {
    // Arrange
    class BaseDto {}
    (BaseDto as any)[RAW] = {
      name: { validation: [{ rule: isString }], transform: [], expose: [], exclude: null, type: null, flags: {}, schema: null },
    };

    class ChildDto extends BaseDto {}
    (ChildDto as any)[RAW] = {
      name: { validation: [{ rule: min(1) }], transform: [], expose: [], exclude: null, type: null, flags: {}, schema: null },
    };
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
    (BaseTr as any)[RAW] = {
      name: { validation: [], transform: [{ fn: parentFn }], expose: [], exclude: null, type: null, flags: {}, schema: null },
    };
    class ChildTr extends BaseTr {}
    (ChildTr as any)[RAW] = {
      name: { validation: [], transform: [{ fn: childFn }], expose: [], exclude: null, type: null, flags: {}, schema: null },
    };
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
    (BaseTr2 as any)[RAW] = {
      x: { validation: [], transform: [{ fn: parentFn2 }], expose: [], exclude: null, type: null, flags: {}, schema: null },
    };
    class ChildTr2 extends BaseTr2 {}
    (ChildTr2 as any)[RAW] = {
      x: { validation: [{ rule: isString }], transform: [], expose: [], exclude: null, type: null, flags: {}, schema: null },
    };
    // Act
    const merged = mergeInheritance(ChildTr2);
    // Assert — parent transform inherited
    expect(merged.x!.transform.length).toBe(1);
    expect(merged.x!.transform[0]!.fn).toBe(parentFn2);
  });

  it('should override parent expose with child expose when child has @Expose', () => {
    // Arrange
    class BaseEx {}
    (BaseEx as any)[RAW] = {
      field: { validation: [], transform: [], expose: [{ name: 'parent_name' }], exclude: null, type: null, flags: {}, schema: null },
    };
    class ChildEx extends BaseEx {}
    (ChildEx as any)[RAW] = {
      field: { validation: [], transform: [], expose: [{ name: 'child_name' }], exclude: null, type: null, flags: {}, schema: null },
    };
    // Act
    const merged = mergeInheritance(ChildEx);
    // Assert — child name used, not parent
    expect(merged.field!.expose[0]!.name).toBe('child_name');
  });

  it('should inherit parent expose when child has no @Expose', () => {
    // Arrange
    class BaseEx2 {}
    (BaseEx2 as any)[RAW] = {
      field: { validation: [], transform: [], expose: [{ name: 'parent_exposed' }], exclude: null, type: null, flags: {}, schema: null },
    };
    class ChildEx2 extends BaseEx2 {}
    (ChildEx2 as any)[RAW] = {
      field: { validation: [{ rule: isString }], transform: [], expose: [], exclude: null, type: null, flags: {}, schema: null },
    };
    // Act
    const merged = mergeInheritance(ChildEx2);
    // Assert — parent expose inherited
    expect(merged.field!.expose.length).toBe(1);
    expect(merged.field!.expose[0]!.name).toBe('parent_exposed');
  });

  it('should inherit parent exclude when child has no exclude', () => {
    // Arrange
    class BaseExcl {}
    (BaseExcl as any)[RAW] = {
      secret: { validation: [], transform: [], expose: [], exclude: { serializeOnly: true }, type: null, flags: {}, schema: null },
    };
    class ChildExcl extends BaseExcl {}
    (ChildExcl as any)[RAW] = {
      secret: { validation: [{ rule: isString }], transform: [], expose: [], exclude: null, type: null, flags: {}, schema: null },
    };
    // Act
    const merged = mergeInheritance(ChildExcl);
    // Assert
    expect(merged.secret!.exclude).toEqual({ serializeOnly: true });
  });

  it('should inherit parent type when child has no @Type', () => {
    // Arrange
    class NestedDto {}
    class BaseType {}
    (BaseType as any)[RAW] = {
      nested: { validation: [], transform: [], expose: [], exclude: null, type: { fn: () => NestedDto }, flags: {}, schema: null },
    };
    class ChildType extends BaseType {}
    (ChildType as any)[RAW] = {
      nested: { validation: [], transform: [], expose: [], exclude: null, type: null, flags: {}, schema: null },
    };
    // Act
    const merged = mergeInheritance(ChildType);
    // Assert
    expect(merged.nested!.type?.fn()).toBe(NestedDto);
  });

  it('should apply child-first flag merge (isOptional)', () => {
    // Arrange
    class BaseFlag {}
    (BaseFlag as any)[RAW] = {
      age: { validation: [], transform: [], expose: [], exclude: null, type: null, flags: { isOptional: true }, schema: null },
    };
    class ChildFlag extends BaseFlag {}
    (ChildFlag as any)[RAW] = {
      age: { validation: [], transform: [], expose: [], exclude: null, type: null, flags: {}, schema: null },
    };
    // Act
    const merged = mergeInheritance(ChildFlag);
    // Assert — parent flag inherited (child has none)
    expect(merged.age!.flags.isOptional).toBe(true);
  });

  it('should not add duplicate validation rules during union merge', () => {
    // Arrange — same rule instance in both parent and child
    const sharedRule = isString;
    class BaseDup {}
    (BaseDup as any)[RAW] = {
      f: { validation: [{ rule: sharedRule }], transform: [], expose: [], exclude: null, type: null, flags: {}, schema: null },
    };
    class ChildDup extends BaseDup {}
    (ChildDup as any)[RAW] = {
      f: { validation: [{ rule: sharedRule }], transform: [], expose: [], exclude: null, type: null, flags: {}, schema: null },
    };
    // Act
    const merged = mergeInheritance(ChildDup);
    // Assert — deduplicated
    expect(merged.f!.validation.length).toBe(1);
  });

  // ── Object.hasOwn — prototype chain 체인 수집 정확성 (H2) ─────────────────

  it('should not include child in chain when child has no own RAW (inherits via prototype)', () => {
    // Arrange
    class ParentNR {}
    (ParentNR as any)[RAW] = makeStringField('x');
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
    (BaseNR2 as any)[RAW] = {
      name: { validation: [{ rule: isString }], transform: [], expose: [], exclude: null, type: null, flags: {}, schema: null },
    };
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
    (GrandNR as any)[RAW] = makeStringField('a');
    class MidNR extends GrandNR {}
    // MidNR has no own RAW
    class ChildNR3 extends MidNR {}
    (ChildNR3 as any)[RAW] = makeStringField('b');
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
    (GrandParent as any)[RAW] = {
      x: { validation: [{ rule: isString }], transform: [], expose: [], exclude: null, type: null, flags: {}, schema: null },
    };
    class ParentLevel extends GrandParent {}
    (ParentLevel as any)[RAW] = {
      x: { validation: [{ rule: min(1) }], transform: [], expose: [], exclude: null, type: null, flags: {}, schema: null },
    };
    class Child3 extends ParentLevel {}
    (Child3 as any)[RAW] = {
      x: { validation: [{ rule: max(100) }], transform: [], expose: [], exclude: null, type: null, flags: {}, schema: null },
    };
    // Act
    const merged = mergeInheritance(Child3);
    // Assert — all 3 rules in union
    expect(merged.x!.validation.length).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C5: sealOne — banned field names (prototype pollution prevention)
// ─────────────────────────────────────────────────────────────────────────────

/** RAW 메타에 bannedKey 이름의 필드를 own enumerable property로 추가하는 헬퍼 */
function makeRawWithBannedKey(bannedKey: string): RawClassMeta {
  const fieldMeta = { validation: [], transform: [], expose: [], exclude: null, type: null, flags: {}, schema: null };
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
    expect(() => _autoSeal()).toThrow(SealError);
  });

  it('should throw SealError when a field is named constructor', () => {
    // Arrange
    class BannedConstructorDto {}
    const raw = { constructor: { validation: [], transform: [], expose: [], exclude: null, type: null, flags: {}, schema: null } } as unknown as RawClassMeta;
    registerClass(BannedConstructorDto, raw);
    // Act / Assert
    expect(() => _autoSeal()).toThrow(SealError);
  });

  it('should throw SealError when a field is named prototype', () => {
    // Arrange
    class BannedPrototypeDto {}
    const raw = { prototype: { validation: [], transform: [], expose: [], exclude: null, type: null, flags: {}, schema: null } } as unknown as RawClassMeta;
    registerClass(BannedPrototypeDto, raw);
    // Act / Assert
    expect(() => _autoSeal()).toThrow(SealError);
  });

  it('should throw SealError even when banned field coexists with valid fields', () => {
    // Arrange — both a valid field ('name') and a banned field ('constructor')
    class MixedBannedDto {}
    const raw = Object.create(null) as RawClassMeta;
    Object.defineProperty(raw, 'name', {
      value: { validation: [{ rule: isString }], transform: [], expose: [], exclude: null, type: null, flags: {}, schema: null },
      enumerable: true, writable: true, configurable: true,
    });
    Object.defineProperty(raw, 'constructor', {
      value: { validation: [], transform: [], expose: [], exclude: null, type: null, flags: {}, schema: null },
      enumerable: true, writable: true, configurable: true,
    });
    registerClass(MixedBannedDto, raw);
    // Act / Assert
    expect(() => _autoSeal()).toThrow(SealError);
  });

  it('should not throw SealError for __PROTO__ (uppercase — not a banned name)', () => {
    // Arrange — same letters but different case, not a reserved name
    class UpperCaseDto {}
    registerClass(UpperCaseDto, makeRawWithBannedKey('__PROTO__'));
    // Act / Assert
    expect(() => _autoSeal()).not.toThrow();
  });
});
