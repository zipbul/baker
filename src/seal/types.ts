import type { Result, ResultAsync } from '@zipbul/result';

import type { RuntimeOptions, BakerIssue } from '../common';

/** Compiled deserialize executor — Result pattern (or its async variant), produced by the builder. */
export type DeserializeExecutor<T> = (
  input: unknown,
  opts?: RuntimeOptions,
) => Result<T, BakerIssue[]> | ResultAsync<T, BakerIssue[]>;

/** Compiled validate-only executor — null on success, BakerIssue[] on failure (or its async variant). */
export type ValidateExecutor = (input: unknown, opts?: RuntimeOptions) => BakerIssue[] | null | Promise<BakerIssue[] | null>;
