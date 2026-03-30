import { describe, it, expect, afterEach } from 'bun:test';
import { analyzeCircular } from './circular-analyzer';
import { RAW } from '../symbols';
import type { RawClassMeta } from '../types';

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
      type: { fn: fn as () => new (...args: any[]) => any },
      flags: {},
     
    },
  };
}

function makeDiscriminatorMeta(
  subTypes: { value: Function; name: string }[],
): RawClassMeta {
  return {
    field: {
      validation: [],
      transform: [],
      expose: [],
      exclude: null,
      type: {
        fn: () => subTypes[0]!.value as new (...args: any[]) => any,
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
    (NoTypeDto as any)[RAW] = {
      name: { validation: [], transform: [], expose: [], exclude: null, type: null, flags: {} },
    };
    // Act
    const result = analyzeCircular(NoTypeDto);
    // Assert
    expect(result).toBe(false);
  });

  it('should return false for linear A -> B chain with no cycle', () => {
    // Arrange
    class BDto {}
    (BDto as any)[RAW] = {};

    class ADto {}
    (ADto as any)[RAW] = makeTypeMeta(() => BDto);

    // Act
    const result = analyzeCircular(ADto);
    // Assert
    expect(result).toBe(false);
  });

  it('should return false when referenced class has no RAW symbol', () => {
    // Arrange — B has no [RAW]
    class BNoRaw {}
    class ADto {}
    (ADto as any)[RAW] = makeTypeMeta(() => BNoRaw);
    // Act
    const result = analyzeCircular(ADto);
    // Assert
    expect(result).toBe(false);
  });

  // ── Negative / Error ───────────────────────────────────────────────────────

  it('should return true when class references itself (self-loop)', () => {
    // Arrange
    class SelfRefDto {}
    (SelfRefDto as any)[RAW] = makeTypeMeta(() => SelfRefDto);
    // Act
    const result = analyzeCircular(SelfRefDto);
    // Assert
    expect(result).toBe(true);
  });

  it('should return true for mutual reference A -> B -> A', () => {
    // Arrange
    class BDto2 {}
    class ADto2 {}

    (ADto2 as any)[RAW] = makeTypeMeta(() => BDto2);
    (BDto2 as any)[RAW] = makeTypeMeta(() => ADto2);

    // Act
    const result = analyzeCircular(ADto2);
    // Assert
    expect(result).toBe(true);
  });

  it('should return true when discriminator subType cycles back', () => {
    // Arrange
    class ContentDto {}
    class ParentDto {}
    (ContentDto as any)[RAW] = makeTypeMeta(() => ParentDto);
    (ParentDto as any)[RAW] = makeDiscriminatorMeta([{ value: ContentDto, name: 'content' }]);

    // Act
    const result = analyzeCircular(ParentDto);
    // Assert
    expect(result).toBe(true);
  });

  it('should detect cycle via second discriminator subType (covers discriminator loop body)', () => {
    // Arrange — A.fn → B (no cycle), A.discriminator.subTypes[1] → C → A (cycle)
    class BDto {}
    (BDto as any)[RAW] = {}; // no @Type, no cycle

    class CDto {}
    class ADto {}

    (CDto as any)[RAW] = makeTypeMeta(() => ADto); // C → A (creates cycle)
    (ADto as any)[RAW] = {
      field: {
        validation: [], transform: [], expose: [], exclude: null,
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
    };

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
    (EmptyDto as any)[RAW] = {};
    // Act
    const result = analyzeCircular(EmptyDto);
    // Assert
    expect(result).toBe(false);
  });

  // ── Idempotency ────────────────────────────────────────────────────────────

  it('should return the same result on repeated calls (idempotent)', () => {
    // Arrange
    class IdemDto {}
    (IdemDto as any)[RAW] = {};
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

    (BDto as any)[RAW] = makeTypeMeta(() => ADto);
    (CDto as any)[RAW] = makeTypeMeta(() => ADto);
    (DDto as any)[RAW] = makeTypeMeta(() => ADto);

    (ADto as any)[RAW] = makeDiscriminatorMeta([
      { value: BDto, name: 'b' },
      { value: CDto, name: 'c' },
      { value: DDto, name: 'd' },
    ]);

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

    (BDto as any)[RAW] = {};
    (CDto as any)[RAW] = {};
    (DDto as any)[RAW] = {};

    (ADto as any)[RAW] = makeDiscriminatorMeta([
      { value: BDto, name: 'b' },
      { value: CDto, name: 'c' },
      { value: DDto, name: 'd' },
    ]);

    // Act
    const result = analyzeCircular(ADto);

    // Assert — no cycle
    expect(result).toBe(false);
  });

  // ── E-3: lazy type throw → SealError (→ B-7) ─────────────────────────────

  it('should throw SealError when lazy type function throws', () => {
    // Arrange
    class LazyThrowDto {}
    (LazyThrowDto as any)[RAW] = makeTypeMeta(() => { throw new Error('boom'); });
    // Act / Assert
    expect(() => analyzeCircular(LazyThrowDto)).toThrow('boom');
  });

  it('should include class name in SealError when lazy type throws', () => {
    // Arrange
    class NamedThrowDto {}
    (NamedThrowDto as any)[RAW] = makeTypeMeta(() => { throw new Error('broken ref'); });
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
