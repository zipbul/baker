import type { BakerIssueSet } from '../../../src/common/errors';

import { isBakerIssueSet } from '../../../src/common/errors';

/**
 * Test-only assertion helper — narrows `result` to `BakerIssueSet`.
 *
 * Allows tests to read `result.errors` without an in-test `if` (which would
 * trigger oxlint's `jest(no-conditional-in-test)` rule).
 */
export function assertBakerIssueSet(value: unknown): asserts value is BakerIssueSet {
  if (!isBakerIssueSet(value)) {
    throw new Error(`expected BakerIssue, got: ${JSON.stringify(value)}`);
  }
}

/**
 * Test-only assertion helper — narrows `result` away from `BakerIssueSet`.
 *
 * After this call, the value is the success branch (e.g. a DTO instance).
 */
export function assertNotBakerIssueSet<T>(value: T | BakerIssueSet): asserts value is T {
  if (isBakerIssueSet(value)) {
    throw new Error(`expected success, got BakerIssue: ${JSON.stringify(value.errors)}`);
  }
}

/**
 * Test-only assertion helper — narrows a deserialize outcome to its `E` (raw error array) branch.
 *
 * Required because in-test `if (!Array.isArray(result)) throw` triggers
 * jest(no-conditional-in-test); placing the `if` inside this helper avoids it.
 */
export function assertIsErr<E = unknown>(value: unknown): asserts value is E {
  if (!Array.isArray(value)) {
    throw new Error(`expected an error array, got: ${JSON.stringify(value)}`);
  }
}

/** Test-only assertion: narrows `value` away from `null | undefined`. */
export function assertDefined<T>(value: T): asserts value is NonNullable<T> {
  if (value === null || value === undefined) {
    throw new Error(`expected defined value, got: ${String(value)}`);
  }
}
