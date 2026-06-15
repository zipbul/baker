import type { BakerConfig } from './configure';
import type { SealOptions } from './interfaces';

import { normalizeConfig } from './configure';
import { sealRegistry } from './seal/seal';

/**
 * A baker — an isolated registration + seal boundary. Each `new Baker()` owns its own registry and
 * config, so multiple bakers in one process (or a bundler-duplicated copy of the library) never
 * fragment each other. `@Field`, the rule factories, and `deserialize`/`serialize`/`validate` stay
 * global — they read the metadata/executor stored on the class itself — so only the class-collecting
 * `Recipe` and `seal` belong to the instance.
 *
 * ```ts
 * const app = new Baker({ autoConvert: true });
 * @app.Recipe class UserDto { @Field(isString) name!: string }
 * app.seal();
 * deserialize(UserDto, input);
 * ```
 *
 * Isolation boundary is class identity: distinct classes are fully isolated (each sealed with its
 * baker's config); a class shared across bakers is reused as one sealed form.
 *
 * `Recipe` and `seal` are arrow-field properties, not prototype methods, by design: `@app.Recipe`
 * is applied as a detached value (the runtime calls the decorator with no `this` receiver), so it
 * must be bound to the instance; arrow fields also keep `const { Recipe, seal } = new Baker()`
 * working.
 */
export class Baker {
  readonly #registry = new Set<Function>();
  readonly #options: SealOptions;
  #sealed = false;

  constructor(config?: BakerConfig) {
    this.#options = config === undefined ? Object.freeze({}) : normalizeConfig(config);
  }

  /** Class decorator — registers the class as a root of this baker. Use as `@app.Recipe`. */
  readonly Recipe = (value: Function, _context: ClassDecoratorContext): void => {
    this.#registry.add(value);
  };

  /** Seal every root registered to this baker (and its nested DTOs) with this baker's config. */
  readonly seal = (): void => {
    if (this.#sealed) {
      return;
    }
    sealRegistry(this.#registry, this.#options);
    this.#sealed = true;
  };
}
