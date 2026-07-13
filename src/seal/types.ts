import type { RuntimeOptions, BakerIssue } from '../common';

/**
 * Deserialize executor outcome — success is the instance `T`, failure is the raw `BakerIssue[]`
 * array itself. Discriminate with `Array.isArray()`: sound because seal rejects Array-exotic DTO
 * classes (see the guard in seal.ts sealOne), so a success instance can never satisfy
 * `Array.isArray`. May be wrapped in a `Promise` for async executors.
 */
export type DeserializeOutcome<T> = T | BakerIssue[] | Promise<T | BakerIssue[]>;

/** Compiled deserialize executor — array-sentinel protocol (or its async variant), produced by the builder. */
export type DeserializeExecutor<T> = (input: unknown, opts?: RuntimeOptions) => DeserializeOutcome<T>;

/** Compiled validate-only executor — null on success, BakerIssue[] on failure (or its async variant). */
export type ValidateExecutor = (input: unknown, opts?: RuntimeOptions) => BakerIssue[] | null | Promise<BakerIssue[] | null>;
