import { describe, it, expect } from 'bun:test';
import { seal, SealError, Min, unregister } from '../../index';
import { MinLength } from '../../src/decorators/string';

// ─────────────────────────────────────────────────────────────────────────────
// L453 — conflicting requiresType → SealError
// ─────────────────────────────────────────────────────────────────────────────

describe('conflicting requiresType', () => {
  it('@MinLength (requiresType string) + @Min (requiresType number) → SealError', () => {
    class ConflictDto {
      @MinLength(1)
      @Min(0)
      value!: string;
    }
    expect(() => seal()).toThrow(SealError);
    unregister(ConflictDto);
  });
});
