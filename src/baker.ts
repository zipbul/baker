import type { BakerConfig } from './config/configure';
import type { BakerIssueSet } from './common/errors';
import type { RuntimeOptions, SealOptions } from './interfaces';
import type { SealedExecutors } from './types';

import { normalizeConfig } from './config/configure';
import { BakerError } from './common/errors';
import { runDeserialize, runDeserializeSync, runDeserializeAsync } from './runtime/deserialize';
import { resolveSerializeClass, runSerialize, runSerializeSync, runSerializeAsync } from './runtime/serialize';
import { runValidate, runValidateSync, runValidateAsync } from './runtime/validate';
import { sealRegistry } from './seal/seal';

/**
 * A baker — an isolated registration + seal + runtime boundary. Each `new Baker()` owns its own
 * registry, config, and compiled executors, so multiple bakers in one process (or a bundler-duplicated
 * copy of the library) never fragment each other. `@Field` and the rule factories stay global (they
 * write class-intrinsic schema); registration (`Recipe`), sealing (`seal`), and running
 * (`deserialize`/`serialize`/`validate`) all belong to the instance.
 *
 * ```ts
 * const app = new Baker({ autoConvert: true });
 * @app.Recipe class UserDto { @Field(isString) name!: string }
 * app.seal();
 * app.deserialize(UserDto, input);
 * ```
 *
 * Isolation boundary is class identity, scoped per baker: the SAME class sealed by two bakers with
 * different configs behaves per each baker's config (each compiles its own executor into its own map).
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

  /**
   * Resolve a class's executor from this baker's own map, walking the prototype chain so an
   * undecorated subclass of a sealed class resolves to its nearest sealed ancestor (matching how a
   * class statically inherits the sealed executor). The resolved executor is memoized onto the
   * subclass for O(1) subsequent lookups. Throws if no ancestor was sealed by this baker.
   */
  #require(Class: Function): SealedExecutors<unknown> {
    let cur: Function | null = Class;
    while (cur) {
      const sealed = this.#executors.get(cur);
      if (sealed) {
        if (cur !== Class) {
          this.#executors.set(Class, sealed);
        }
        return sealed;
      }
      const proto = Object.getPrototypeOf(cur) as unknown;
      cur = typeof proto === 'function' ? proto : null;
    }
    const name = Class.name || '<anonymous class>';
    throw new BakerError(`${name} is not sealed by this baker`);
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
