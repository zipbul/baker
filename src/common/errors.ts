// ─────────────────────────────────────────────────────────────────────────────
// BakerIssue — Individual field error
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
 * Future extension fields (expected, actual, etc.) must be added as Optional.
 */
export interface BakerIssue {
  readonly path: string;
  readonly code: string;
  /** User-defined error message — included only when the decorator message option is set */
  readonly message?: string;
  /** User-defined context — included only when the decorator context option is set */
  readonly context?: unknown;
  /**
   * The failing rule's constraint parameters (e.g. `{ min: 5 }` for `min(5)`), included only when the
   * rule stamps non-empty constraints. Type-check rules and structural gates carry none.
   */
  readonly constraints?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// BakerIssueSet — Validation failure return
// ─────────────────────────────────────────────────────────────────────────────

/** Symbol tag for isBakerIssueSet() type guard — collision-proof discriminator */
export const BAKER_ERROR: unique symbol = Symbol.for('baker:error');

/** Validation failure — returned by deserialize()/validate() on invalid input */
export interface BakerIssueSet {
  readonly [BAKER_ERROR]: true;
  readonly errors: readonly BakerIssue[];
}

/**
 * Type guard — narrows deserialize()/validate() result to BakerIssueSet.
 *
 * @example
 * const result = await deserialize(UserDto, input);
 * if (isBakerIssueSet(result)) {
 *   result.errors // readonly BakerIssue[]
 * } else {
 *   result // UserDto
 * }
 */
export function isBakerIssueSet(value: unknown): value is BakerIssueSet {
  return (
    value != null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as { [BAKER_ERROR]?: unknown })[BAKER_ERROR] === true
  );
}

/** @internal — create BakerIssueSet object */
export function toBakerIssueSet(errors: BakerIssue[]): BakerIssueSet {
  return { [BAKER_ERROR]: true as const, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// BakerError — the single throw channel
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The single error thrown by baker for any developer/config/schema misuse — i.e. anything
 * discoverable without external input. End-user input-data failures are NOT thrown; they are
 * returned as a {@link BakerIssueSet}.
 *
 * Thrown when, e.g.:
 * - deserialize()/serialize()/validate() is called on an unsealed class
 * - new Baker() receives a config object with an unknown key or a non-plain-object
 * - seal-time metadata invariants fail (discriminator, Map keys, banned names, Array-exotic DTO classes, …)
 * - per-call options contain unsupported keys
 * - @Field receives a non-rule value, or a rule/transformer factory is misused
 * - a user @Type/collectionValue thunk throws (wrapped, with the original error as `cause`)
 * - an optional peer dependency (luxon/moment) is missing
 */
export class BakerError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'BakerError';
  }
}
