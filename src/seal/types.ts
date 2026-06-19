import type { Result, ResultAsync } from '@zipbul/result';

import type { BakerIssue } from '../common/errors';
import type { RuntimeOptions } from '../common/interfaces';
import type { RawClassMeta } from '../metadata/types';

// ─────────────────────────────────────────────────────────────────────────────
// SealedExecutors — Dual executor stored in the Baker's per-instance executor map (§2.1)
// ─────────────────────────────────────────────────────────────────────────────

export interface SealedExecutors<T> {
  /** Internal executor — Result pattern. deserialize() wraps and converts to throw */
  deserialize(input: unknown, options?: RuntimeOptions): Result<T, BakerIssue[]> | ResultAsync<T, BakerIssue[]>;
  /** Internal executor — always succeeds. serialize assumes no validation */
  serialize(instance: T, options?: RuntimeOptions): Record<string, unknown> | Promise<Record<string, unknown>>;
  /** Internal executor — validate-only (no object creation). Returns null on success, BakerIssue[] on failure */
  validate(input: unknown, options?: RuntimeOptions): BakerIssue[] | null | Promise<BakerIssue[] | null>;
  /** true if the deserialize direction has async rules/transforms/nested */
  isAsync: boolean;
  /** true if the serialize direction has async transforms/nested */
  isSerializeAsync: boolean;
  /** Merged metadata cache — used internally by unseal helper */
  merged?: RawClassMeta;
}
