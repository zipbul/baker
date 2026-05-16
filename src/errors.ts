// ─────────────────────────────────────────────────────────────────────────────
// BakerError — Individual field error (§12.2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Individual field error — minimum contract.
 *
 * Reserved error codes:
 * - 'invalidInput': when input is null, non-object, or array (path='')
 * - 'isObject': when a nested @Type field's value is not an object
 * - 'isArray': when an array-nested (each:true) field's value is not an array
 * - 'invalidDiscriminator': when the discriminator value is not in subTypes
 * - 'conversionFailed': when type conversion fails in enableImplicitConversion
 * - 'whitelistViolation': when undeclared fields exist in input with whitelist: true
 *
 * Future extension fields (message, expected, actual, etc.) must be added as Optional.
 */
export interface BakerError {
  readonly path: string;
  readonly code: string;
  /** User-defined error message — included only when the decorator message option is set */
  readonly message?: string;
  /** User-defined context — included only when the decorator context option is set */
  readonly context?: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// BakerErrors — Validation failure return (§12.2)
// ─────────────────────────────────────────────────────────────────────────────

/** Symbol tag for isBakerError() type guard — collision-proof discriminator */
export const BAKER_ERROR: unique symbol = Symbol.for('baker:error');

/** Validation failure — returned by deserialize()/validate() on invalid input */
export interface BakerErrors {
  readonly [BAKER_ERROR]: true;
  readonly errors: readonly BakerError[];
}

/**
 * Type guard — narrows deserialize()/validate() result to BakerErrors.
 *
 * @example
 * const result = await deserialize(UserDto, input);
 * if (isBakerError(result)) {
 *   result.errors // readonly BakerError[]
 * } else {
 *   result // UserDto
 * }
 */
export function isBakerError(value: unknown): value is BakerErrors {
  return (
    value != null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as { [BAKER_ERROR]?: unknown })[BAKER_ERROR] === true
  );
}

/** @internal — create BakerErrors object */
export function _toBakerErrors(errors: BakerError[]): BakerErrors {
  return { [BAKER_ERROR]: true as const, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// SealError — Seal-related error (§12.2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Seal-related error:
 * - When deserialize()/serialize()/validate() is called on an unsealed class
 * - When configure() is called after seal()
 * - When seal-time metadata invariants fail (discriminator, Map keys, etc.)
 * - When per-call options contain unsupported keys
 * - When @Field receives a non-rule value
 */
export class SealError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SealError';
  }
}
