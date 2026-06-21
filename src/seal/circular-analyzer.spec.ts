import { describe, it, expect, afterEach } from 'bun:test';

import type { ClassCtor } from '../common/types';
import type { RawClassMeta } from '../metadata/interfaces';

import { metaStore } from '../metadata';
import { CircularAnalyzer } from './circular-analyzer';
import { InheritanceMerger } from './inheritance-merger';

const analyzer = new CircularAnalyzer(new InheritanceMerger(metaStore));

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — manual RAW meta setup
// ─────────────────────────────────────────────────────────────────────────────

function makeTypeMeta(fn: () => Function): RawClassMeta {
  return {
    field: {
      validation: [],
      transform: [],
      expose: [],
      exclude: null,
      type: { fn: fn as () => ClassCtor },
      flags: {},
    },
  };
}

function makeDiscriminatorMeta(subTypes: { value: Function; name: string }[]): RawClassMeta {
  return {
    field: {
      validation: [],
      transform: [],
      expose: [],
      exclude: null,
      type: {
        fn: () => subTypes[0]!.value as ClassCtor,
        discriminator: { property: 'type', subTypes },
      },
      flags: {},
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('analyzeCircular', () => {
  afterEach(() => {
    // Remove RAW set by tests
  });

  // ── Happy Path ─────────────────────────────────────────────────────────────

  it('should return false when DTO has no @Type fields', () => {
    // Arrange
    class NoTypeDto {}
    metaStore.set(NoTypeDto, {
      name: { validation: [], transform: [], expose: [], exclude: null, type: null, flags: {} },
    });
    // Act
    const result = analyzer.analyze(NoTypeDto);
    // Assert
    expect(result).toBe(false);
  });

  it('should return false for linear A -> B chain with no cycle', () => {
    // Arrange
    class BDto {}
    metaStore.set(BDto, {});

    class ADto {}
    metaStore.set(
      ADto,
      makeTypeMeta(() => BDto),
    );

    // Act
    const result = analyzer.analyze(ADto);
    // Assert
    expect(result).toBe(false);
  });

  it('should return false when referenced class has no RAW symbol', () => {
    // Arrange — B has no [RAW]
    class BNoRaw {}
    class ADto {}
    metaStore.set(
      ADto,
      makeTypeMeta(() => BNoRaw),
    );
    // Act
    const result = analyzer.analyze(ADto);
    // Assert
    expect(result).toBe(false);
  });

  // ── Negative / Error ───────────────────────────────────────────────────────

  it('should return true when class references itself (self-loop)', () => {
    // Arrange
    class SelfRefDto {}
    metaStore.set(
      SelfRefDto,
      makeTypeMeta(() => SelfRefDto),
    );
    // Act
    const result = analyzer.analyze(SelfRefDto);
    // Assert
    expect(result).toBe(true);
  });

  it('should return true for mutual reference A -> B -> A', () => {
    // Arrange
    class BDto2 {}
    class ADto2 {}

    metaStore.set(
      ADto2,
      makeTypeMeta(() => BDto2),
    );
    metaStore.set(
      BDto2,
      makeTypeMeta(() => ADto2),
    );

    // Act
    const result = analyzer.analyze(ADto2);
    // Assert
    expect(result).toBe(true);
  });

  it('should detect a cycle that exists only through an inherited @Type field', () => {
    // Arrange — Base declares @Type(() => Derived); Derived extends Base and inherits that field,
    // so Derived -> Derived is a cycle visible only in the inheritance-merged metadata (not in getRaw).
    class Base {}
    class Derived extends Base {}
    metaStore.set(
      Base,
      makeTypeMeta(() => Derived),
    );
    metaStore.set(Derived, {
      label: { validation: [], transform: [], expose: [], exclude: null, type: null, flags: {} },
    });

    // Act
    const result = analyzer.analyze(Derived);

    // Assert — the inherited @Type field forms a self-cycle
    expect(result).toBe(true);
  });

  it('should return true when discriminator subType cycles back', () => {
    // Arrange
    class ContentDto {}
    class ParentDto {}
    metaStore.set(
      ContentDto,
      makeTypeMeta(() => ParentDto),
    );
    metaStore.set(ParentDto, makeDiscriminatorMeta([{ value: ContentDto, name: 'content' }]));

    // Act
    const result = analyzer.analyze(ParentDto);
    // Assert
    expect(result).toBe(true);
  });

  it('should detect cycle via second discriminator subType (covers discriminator loop body)', () => {
    // Arrange — A.fn → B (no cycle), A.discriminator.subTypes[1] → C → A (cycle)
    class BDto {}
    metaStore.set(BDto, {}); // no @Type, no cycle

    class CDto {}
    class ADto {}

    metaStore.set(
      CDto,
      makeTypeMeta(() => ADto),
    ); // C → A (creates cycle)
    metaStore.set(ADto, {
      field: {
        validation: [],
        transform: [],
        expose: [],
        exclude: null,
        type: {
          fn: () => BDto, // fn path goes to B → no cycle
          discriminator: {
            property: 'kind',
            subTypes: [
              { value: BDto, name: 'b' },
              { value: CDto, name: 'c' }, // ← discriminator path cycles via CDto→ADto
            ],
          },
        },
        flags: {},
      },
    });

    // Act
    const result = analyzer.analyze(ADto);
    // Assert
    expect(result).toBe(true);
  });

  // ── Corner ─────────────────────────────────────────────────────────────────

  // ── Edge ───────────────────────────────────────────────────────────────────

  it('should return false when merged has no fields (empty object)', () => {
    // Arrange
    class EmptyDto {}
    metaStore.set(EmptyDto, {});
    // Act
    const result = analyzer.analyze(EmptyDto);
    // Assert
    expect(result).toBe(false);
  });

  // ── Idempotency ────────────────────────────────────────────────────────────

  it('should return the same result on repeated calls (idempotent)', () => {
    // Arrange
    class IdemDto {}
    metaStore.set(IdemDto, {});
    // Act
    const first = analyzer.analyze(IdemDto);
    const second = analyzer.analyze(IdemDto);
    // Assert
    expect(first).toBe(second);
  });

  // ── E-14: 3+ discriminator subTypes cross-referencing — no infinite recursion ──

  it('should not infinite-recurse with 3 discriminator subTypes that cross-reference each other', () => {
    // Arrange — A uses discriminator with subTypes [B, C, D], each referencing back to A
    class ADto {}
    class BDto {}
    class CDto {}
    class DDto {}

    metaStore.set(
      BDto,
      makeTypeMeta(() => ADto),
    );
    metaStore.set(
      CDto,
      makeTypeMeta(() => ADto),
    );
    metaStore.set(
      DDto,
      makeTypeMeta(() => ADto),
    );

    metaStore.set(
      ADto,
      makeDiscriminatorMeta([
        { value: BDto, name: 'b' },
        { value: CDto, name: 'c' },
        { value: DDto, name: 'd' },
      ]),
    );

    // Act — should terminate without stack overflow
    const result = analyzer.analyze(ADto);

    // Assert — cycle exists (A → B → A)
    expect(result).toBe(true);
  });

  it('should return false with 3 discriminator subTypes that do NOT cycle', () => {
    // Arrange — A uses discriminator with subTypes [B, C, D], none reference A
    class ADto {}
    class BDto {}
    class CDto {}
    class DDto {}

    metaStore.set(BDto, {});
    metaStore.set(CDto, {});
    metaStore.set(DDto, {});

    metaStore.set(
      ADto,
      makeDiscriminatorMeta([
        { value: BDto, name: 'b' },
        { value: CDto, name: 'c' },
        { value: DDto, name: 'd' },
      ]),
    );

    // Act
    const result = analyzer.analyze(ADto);

    // Assert — no cycle
    expect(result).toBe(false);
  });

  // ── E-3: lazy type throw → BakerError (→ B-7) ─────────────────────────────

  it('should throw BakerError when lazy type function throws', () => {
    // Arrange
    class LazyThrowDto {}
    metaStore.set(
      LazyThrowDto,
      makeTypeMeta(() => {
        throw new Error('boom');
      }),
    );
    // Act / Assert
    expect(() => analyzer.analyze(LazyThrowDto)).toThrow('boom');
  });

  it('should include class name in BakerError when lazy type throws', () => {
    // Arrange
    class NamedThrowDto {}
    metaStore.set(
      NamedThrowDto,
      makeTypeMeta(() => {
        throw new Error('broken ref');
      }),
    );
    // Act / Assert
    try {
      analyzer.analyze(NamedThrowDto);
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).toContain('NamedThrowDto');
      expect((e as Error).message).toContain('broken ref');
    }
  });
});
