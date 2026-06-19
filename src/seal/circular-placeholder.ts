import type { SealedExecutors } from './types';

import { BakerError } from '../common/errors';

/** @internal Placeholder executor for circular dependency detection during seal */
export function circularPlaceholder(className: string): SealedExecutors<unknown> {
  const msg = `Circular dependency during seal: ${className} is still being sealed`;
  return {
    deserialize() {
      throw new BakerError(msg);
    },
    serialize() {
      throw new BakerError(msg);
    },
    validate() {
      throw new BakerError(msg);
    },
    isAsync: false,
    isSerializeAsync: false,
  };
}
