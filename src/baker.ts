import type { BakerConfig } from './configure';
import type { BakerIssueSet } from './errors';
import type { RuntimeOptions, SealOptions } from './interfaces';
import type { SealedExecutors } from './types';

import { normalizeConfig } from './configure';
import { BakerError } from './errors';
import { runDeserialize, runDeserializeSync, runDeserializeAsync } from './functions/deserialize';
import { resolveSerializeClass, runSerialize, runSerializeSync, runSerializeAsync } from './functions/serialize';
import { runValidate, runValidateSync, runValidateAsync } from './functions/validate';
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
  readonly #executors = new Map<Function, SealedExecutors<unknown>>();
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
    sealRegistry(this.#registry, this.#options, this.#executors);
    this.#sealed = true;
  };

  /** Resolve a class's executor from this baker's own map, or throw if it was not sealed here. */
  #require(Class: Function): SealedExecutors<unknown> {
    const sealed = this.#executors.get(Class);
    if (!sealed) {
      const name = Class.name || '<anonymous class>';
      throw new BakerError(`${name} is not sealed by this baker`);
    }
    return sealed;
  }

  deserialize = <T>(
    Class: new (...args: never[]) => T,
    input: unknown,
    options?: RuntimeOptions,
  ): T | BakerIssueSet | Promise<T | BakerIssueSet> => runDeserialize<T>(this.#require(Class), input, options);

  deserializeSync = <T>(Class: new (...args: never[]) => T, input: unknown, options?: RuntimeOptions): T | BakerIssueSet =>
    runDeserializeSync<T>(this.#require(Class), Class.name, input, options);

  deserializeAsync = <T>(
    Class: new (...args: never[]) => T,
    input: unknown,
    options?: RuntimeOptions,
  ): Promise<T | BakerIssueSet> => runDeserializeAsync<T>(this.#require(Class), input, options);

  validate = <T>(
    Class: new (...args: never[]) => T,
    input: unknown,
    options?: RuntimeOptions,
  ): true | BakerIssueSet | Promise<true | BakerIssueSet> => runValidate(this.#require(Class), input, options);

  validateSync = <T>(Class: new (...args: never[]) => T, input: unknown, options?: RuntimeOptions): true | BakerIssueSet =>
    runValidateSync(this.#require(Class), Class.name, input, options);

  validateAsync = <T>(
    Class: new (...args: never[]) => T,
    input: unknown,
    options?: RuntimeOptions,
  ): Promise<true | BakerIssueSet> => runValidateAsync(this.#require(Class), input, options);

  serialize = <T>(instance: T, options?: RuntimeOptions): Record<string, unknown> | Promise<Record<string, unknown>> =>
    runSerialize(this.#require(resolveSerializeClass(instance, 'serialize')), instance, options);

  serializeSync = <T>(instance: T, options?: RuntimeOptions): Record<string, unknown> => {
    const Class = resolveSerializeClass(instance, 'serializeSync');
    return runSerializeSync(this.#require(Class), Class.name, instance, options);
  };

  serializeAsync = <T>(instance: T, options?: RuntimeOptions): Promise<Record<string, unknown>> =>
    runSerializeAsync(this.#require(resolveSerializeClass(instance, 'serializeAsync')), instance, options);
}
