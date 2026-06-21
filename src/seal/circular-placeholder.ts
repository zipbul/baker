import type { RuntimeOptions } from '../common';
import type { SealedExecutors } from './interfaces';

import { BakerError } from '../common';

/**
 * @internal Placeholder executor parked in the baker's map while a class is mid-seal, to break circular
 * references. The instance IS the placeholder: it holds the still-sealing class name as private state
 * and its executor members throw if invoked before sealing completes.
 *
 * The three executor members are writable OWN (arrow) fields, not prototype methods, so sealOne can
 * replace them in place via `Object.assign(placeholder, { deserialize, … })` once compilation finishes
 * (reference identity is load-bearing — nested refs already hold this object).
 */
export class CircularPlaceholder implements SealedExecutors<unknown> {
  readonly #message: string;

  isAsync = false;
  isSerializeAsync = false;

  constructor(className: string) {
    this.#message = `Circular dependency during seal: ${className} is still being sealed`;
  }

  deserialize = (_input: unknown, _options?: RuntimeOptions): never => {
    throw new BakerError(this.#message);
  };

  serialize = (_instance: unknown, _options?: RuntimeOptions): never => {
    throw new BakerError(this.#message);
  };

  validate = (_input: unknown, _options?: RuntimeOptions): never => {
    throw new BakerError(this.#message);
  };
}
