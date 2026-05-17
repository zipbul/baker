import type { Err } from '@zipbul/result';

import { isErr } from '@zipbul/result';

import type { BakerErrors } from '../../../src/errors';

import { isBakerError } from '../../../src/errors';

/**
 * Test-only assertion helper — narrows `result` to `BakerErrors`.
 *
 * Allows tests to read `result.errors` without an in-test `if` (which would
 * trigger oxlint's `jest(no-conditional-in-test)` rule).
 */
export function assertBakerError(value: unknown): asserts value is BakerErrors {
  if (!isBakerError(value)) {
    throw new Error(`expected BakerError, got: ${JSON.stringify(value)}`);
  }
}

/**
 * Test-only assertion helper — narrows `result` away from `BakerErrors`.
 *
 * After this call, the value is the success branch (e.g. a DTO instance).
 */
export function assertNotBakerError<T>(value: T | BakerErrors): asserts value is T {
  if (isBakerError(value)) {
    throw new Error(`expected success, got BakerError: ${JSON.stringify(value.errors)}`);
  }
}

/**
 * Test-only assertion helper — narrows a Result to its `Err<E>` branch.
 *
 * Required because in-test `if (!isErr<E>(result)) throw` triggers
 * jest(no-conditional-in-test); placing the `if` inside this helper avoids it.
 */
export function assertIsErr<E = unknown>(value: unknown): asserts value is Err<E> {
  if (!isErr<E>(value)) {
    throw new Error(`expected Err, got: ${JSON.stringify(value)}`);
  }
}

/** Test-only assertion: narrows `value` away from `null | undefined`. */
export function assertDefined<T>(value: T): asserts value is NonNullable<T> {
  if (value === null || value === undefined) {
    throw new Error(`expected defined value, got: ${String(value)}`);
  }
}
