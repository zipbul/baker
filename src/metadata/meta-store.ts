import type { RawClassMeta, RawPropertyMeta } from './interfaces';
import type { MetaObject, MetaCarrier } from './types';

import { BakerError } from '../common';
import { RAW } from '../symbols';

/**
 * The single boundary that bridges symbol-keyed decorator metadata to typed RAW metadata. All RAW
 * access goes through this one process-wide `metaStore` instance (and, for the seal pipeline, an
 * injected reference) — no other module touches `Class[Symbol.metadata][this.#rawKey]` directly. The private
 * `#metaOf`/`#ensureOwnMeta` methods are the actual encapsulation; `RAW` itself is process-global
 * (`Symbol.for('baker:raw')`), so the value of consolidating access here is one access protocol, not
 * a "private symbol".
 *
 * RAW lives on the TC39 decorator metadata object (`Class[Symbol.metadata][this.#rawKey]`) — where modern field
 * decorators can write (they receive `context.metadata`, never the class). Sealed executors live in
 * each Baker's own map, never on the class.
 */
class MetaStore {
  /**
   * The RAW metadata key. Injected (default: the process-global `RAW`, `Symbol.for('baker:raw')`) so a
   * test can hand in an isolated symbol; all RAW access below goes through this field.
   */
  readonly #rawKey: typeof RAW;

  constructor(rawKey: typeof RAW = RAW) {
    this.#rawKey = rawKey;
  }

  /** Metadata object visible on cls (own or inherited via the class prototype chain). */
  #metaOf(cls: Function): MetaObject | undefined {
    return (cls as MetaCarrier)[Symbol.metadata] ?? undefined;
  }

  /** The class's OWN metadata object, creating one if absent. */
  #ensureOwnMeta(cls: Function): MetaObject {
    if (!Object.hasOwn(cls, Symbol.metadata)) {
      Object.defineProperty(cls, Symbol.metadata, {
        value: {} as MetaObject,
        writable: true,
        configurable: true,
        enumerable: false,
      });
    }
    return (cls as MetaCarrier)[Symbol.metadata]!;
  }

  get(cls: Function): RawClassMeta | undefined {
    return this.#metaOf(cls)?.[this.#rawKey];
  }

  /**
   * Test-only: like {@link get} but throws if the class has no @Field decorators. Specs use it to
   * assert metadata presence; production reads go through {@link get}/{@link hasOwn}.
   */
  require(cls: Function): RawClassMeta {
    const v = this.get(cls);
    if (v === undefined) {
      throw new BakerError(`${cls.name || '<anonymous>'}: class has no @Field decorators`);
    }
    return v;
  }

  /**
   * Test-only: inject RAW metadata directly, bypassing the @Field decorator path. The seal-pipeline
   * specs use this to author DTOs programmatically; production metadata is written via {@link ensure}.
   */
  set(cls: Function, raw: RawClassMeta): void {
    this.#ensureOwnMeta(cls)[this.#rawKey] = raw;
  }

  /** Test-only: drop a class's own RAW slot so specs can reset state between cases. */
  delete(cls: Function): void {
    if (Object.hasOwn(cls, Symbol.metadata)) {
      delete (cls as MetaCarrier)[Symbol.metadata]![this.#rawKey];
    }
  }

  /**
   * True only when cls has its OWN RAW slot. A subclass without its own @Field decorators resolves
   * `Class[Symbol.metadata]` to the parent's metadata via the class prototype chain; the dual own-check
   * keeps inheritance merging from double-counting inherited fields.
   */
  hasOwn(cls: Function): boolean {
    if (!Object.hasOwn(cls, Symbol.metadata)) {
      return false;
    }
    const meta = (cls as MetaCarrier)[Symbol.metadata];
    return meta != null && Object.hasOwn(meta, this.#rawKey);
  }

  /**
   * The RawPropertyMeta for `key` on a decorator metadata object — creating the RAW slot and the
   * per-key default meta if absent. Called by @Field, which receives `context.metadata`.
   *
   * The own-RAW check is required: a subclass's metadata inherits the parent's RAW via the metadata
   * prototype chain, so a bare assignment would pollute the parent. A fresh own RAW (null prototype)
   * keeps child fields isolated.
   */
  ensure(metadata: MetaObject, key: string): RawPropertyMeta {
    if (!Object.hasOwn(metadata, this.#rawKey)) {
      metadata[this.#rawKey] = Object.create(null) as RawClassMeta;
    }
    const raw = metadata[this.#rawKey]!;
    return (raw[key] ??= {
      validation: [],
      transform: [],
      expose: [],
      exclude: null,
      type: null,
      flags: {},
    });
  }
}

export { MetaStore };
export const metaStore = new MetaStore();
