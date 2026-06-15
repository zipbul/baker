import type { BakerConfig } from './configure';
import type { SealOptions } from './interfaces';

import { normalizeConfig } from './configure';
import { sealRegistry } from './seal/seal';

/**
 * A baker scope — an isolated registration + seal boundary. Each `createBaker()` owns its own
 * registry and config; classes sealed through it are attributed to it, so separate scopes never
 * mix. `@Field`, rules, transformers, and `deserialize/serialize/validate` stay global (they read
 * the metadata/executor stored on the class), so only the class-collecting `Recipe` and `seal` are
 * scoped.
 */
export interface Baker {
  /** Class decorator — registers the class as a root of THIS scope. Use as `@app.Recipe`. */
  readonly Recipe: (value: Function, context: ClassDecoratorContext) => void;
  /** Seal every root registered to this scope (and its nested DTOs) with this scope's config. */
  readonly seal: () => void;
}

/**
 * Create an isolated baker scope. Use for libraries and multi-app processes where each app must
 * not mix with another. Single-app code can keep using the global `@Recipe` / `seal()` / `configure()`.
 *
 * ```ts
 * const app = createBaker({ autoConvert: true });
 * @app.Recipe class UserDto { @Field(isString) name!: string }
 * app.seal();
 * deserialize(UserDto, input); // global — reads UserDto's sealed executor
 * ```
 */
export function createBaker(config?: BakerConfig): Baker {
  const registry = new Set<Function>();
  const options: SealOptions = config === undefined ? Object.freeze({}) : normalizeConfig(config);
  let sealed = false;

  return {
    Recipe(value: Function): void {
      registry.add(value);
    },
    seal(): void {
      if (sealed) {
        return;
      }
      sealRegistry(registry, options);
      sealed = true;
    },
  };
}
