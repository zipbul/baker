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
// BakerValidationError — Public API throw error (§12.2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Error thrown on deserialize() validation failure.
 * The errors array contains all field errors.
 */
export class BakerValidationError extends Error {
  readonly errors: BakerError[];
  /** Target DTO class name for validation (DX-2) */
  readonly className?: string;

  constructor(errors: BakerError[], className?: string) {
    const prefix = className ? `Validation failed for ${className}` : 'Validation failed';
    super(`${prefix}: ${errors.length} error(s)`);
    this.name = 'BakerValidationError';
    this.errors = errors;
    this.className = className;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SealError — Seal-related error (§12.2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Seal-related error:
 * - When seal() is called more than once
 * - When deserialize()/serialize() is called on an unsealed class
 */
export class SealError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SealError';
  }
}
