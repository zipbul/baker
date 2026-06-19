import { describe, it, expect, afterEach } from 'bun:test';

import type { ClassCtor } from '../common/types';
import type { RawClassMeta } from '../metadata/types';

import { setRaw } from '../metadata/meta-access';
import { analyzeCircular } from './circular-analyzer';

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
    setRaw(NoTypeDto, {
      name: { validation: [], transform: [], expose: [], exclude: null, type: null, flags: {} },
    });
    // Act
    const result = analyzeCircular(NoTypeDto);
    // Assert
    expect(result).toBe(false);
  });

  it('should return false for linear A -> B chain with no cycle', () => {
    // Arrange
    class BDto {}
    setRaw(BDto, {});

    class ADto {}
    setRaw(
      ADto,
      makeTypeMeta(() => BDto),
    );

    // Act
    const result = analyzeCircular(ADto);
    // Assert
    expect(result).toBe(false);
  });

  it('should return false when referenced class has no RAW symbol', () => {
    // Arrange — B has no [RAW]
    class BNoRaw {}
    class ADto {}
    setRaw(
      ADto,
      makeTypeMeta(() => BNoRaw),
    );
    // Act
    const result = analyzeCircular(ADto);
    // Assert
    expect(result).toBe(false);
  });

  // ── Negative / Error ───────────────────────────────────────────────────────

  it('should return true when class references itself (self-loop)', () => {
    // Arrange
    class SelfRefDto {}
    setRaw(
      SelfRefDto,
      makeTypeMeta(() => SelfRefDto),
    );
    // Act
    const result = analyzeCircular(SelfRefDto);
    // Assert
    expect(result).toBe(true);
  });

  it('should return true for mutual reference A -> B -> A', () => {
    // Arrange
    class BDto2 {}
    class ADto2 {}

    setRaw(
      ADto2,
      makeTypeMeta(() => BDto2),
    );
    setRaw(
      BDto2,
      makeTypeMeta(() => ADto2),
    );

    // Act
    const result = analyzeCircular(ADto2);
    // Assert
    expect(result).toBe(true);
  });

  it('should return true when discriminator subType cycles back', () => {
    // Arrange
    class ContentDto {}
    class ParentDto {}
    setRaw(
      ContentDto,
      makeTypeMeta(() => ParentDto),
    );
    setRaw(ParentDto, makeDiscriminatorMeta([{ value: ContentDto, name: 'content' }]));

    // Act
    const result = analyzeCircular(ParentDto);
    // Assert
    expect(result).toBe(true);
  });

  it('should detect cycle via second discriminator subType (covers discriminator loop body)', () => {
    // Arrange — A.fn → B (no cycle), A.discriminator.subTypes[1] → C → A (cycle)
    class BDto {}
    setRaw(BDto, {}); // no @Type, no cycle

    class CDto {}
    class ADto {}

    setRaw(
      CDto,
      makeTypeMeta(() => ADto),
    ); // C → A (creates cycle)
    setRaw(ADto, {
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
    const result = analyzeCircular(ADto);
    // Assert
    expect(result).toBe(true);
  });

  // ── Corner ─────────────────────────────────────────────────────────────────

  // ── Edge ───────────────────────────────────────────────────────────────────

  it('should return false when merged has no fields (empty object)', () => {
    // Arrange
    class EmptyDto {}
    setRaw(EmptyDto, {});
    // Act
    const result = analyzeCircular(EmptyDto);
    // Assert
    expect(result).toBe(false);
  });

  // ── Idempotency ────────────────────────────────────────────────────────────

  it('should return the same result on repeated calls (idempotent)', () => {
    // Arrange
    class IdemDto {}
    setRaw(IdemDto, {});
    // Act
    const first = analyzeCircular(IdemDto);
    const second = analyzeCircular(IdemDto);
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

    setRaw(
      BDto,
      makeTypeMeta(() => ADto),
    );
    setRaw(
      CDto,
      makeTypeMeta(() => ADto),
    );
    setRaw(
      DDto,
      makeTypeMeta(() => ADto),
    );

    setRaw(
      ADto,
      makeDiscriminatorMeta([
        { value: BDto, name: 'b' },
        { value: CDto, name: 'c' },
        { value: DDto, name: 'd' },
      ]),
    );

    // Act — should terminate without stack overflow
    const result = analyzeCircular(ADto);

    // Assert — cycle exists (A → B → A)
    expect(result).toBe(true);
  });

  it('should return false with 3 discriminator subTypes that do NOT cycle', () => {
    // Arrange — A uses discriminator with subTypes [B, C, D], none reference A
    class ADto {}
    class BDto {}
    class CDto {}
    class DDto {}

    setRaw(BDto, {});
    setRaw(CDto, {});
    setRaw(DDto, {});

    setRaw(
      ADto,
      makeDiscriminatorMeta([
        { value: BDto, name: 'b' },
        { value: CDto, name: 'c' },
        { value: DDto, name: 'd' },
      ]),
    );

    // Act
    const result = analyzeCircular(ADto);

    // Assert — no cycle
    expect(result).toBe(false);
  });

  // ── E-3: lazy type throw → BakerError (→ B-7) ─────────────────────────────

  it('should throw BakerError when lazy type function throws', () => {
    // Arrange
    class LazyThrowDto {}
    setRaw(
      LazyThrowDto,
      makeTypeMeta(() => {
        throw new Error('boom');
      }),
    );
    // Act / Assert
    expect(() => analyzeCircular(LazyThrowDto)).toThrow('boom');
  });

  it('should include class name in BakerError when lazy type throws', () => {
    // Arrange
    class NamedThrowDto {}
    setRaw(
      NamedThrowDto,
      makeTypeMeta(() => {
        throw new Error('broken ref');
      }),
    );
    // Act / Assert
    try {
      analyzeCircular(NamedThrowDto);
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).toContain('NamedThrowDto');
      expect((e as Error).message).toContain('broken ref');
    }
  });
});
