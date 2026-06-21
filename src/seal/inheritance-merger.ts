import type { RawClassMeta, MetaStore } from '../metadata';

/**
 * Merges RAW metadata child-first along the prototype chain of a class. Holds the {@link MetaStore} it
 * reads RAW through as an injected collaborator.
 *
 * Merge rules:
 * - validation: union by ruleName — child wins on a same-ruleName collision; otherwise parent rules are appended
 * - transform: child takes priority, inherits from parent if absent in child
 * - expose: child takes priority, inherits from parent if absent in child
 * - exclude: child takes priority, inherits from parent if absent in child
 * - type: child takes priority, inherits from parent if absent in child
 * - flags: child takes priority, only missing flags are supplemented from parent
 */
export class InheritanceMerger {
  readonly #meta: MetaStore;

  constructor(meta: MetaStore) {
    this.#meta = meta;
  }

  merge(Class: Function): RawClassMeta {
    // Collect classes with RAW along the prototype chain (array order: child first)
    const chain: Function[] = [];
    let current: Function | null = Class;
    while (current && current !== Object) {
      if (this.#meta.hasOwn(current)) {
        chain.push(current);
      }
      const proto = Object.getPrototypeOf(current);
      current = proto === current ? null : proto;
    }

    // child-first merge
    const merged: RawClassMeta = Object.create(null) as RawClassMeta;

    for (const ctor of chain) {
      const raw = this.#meta.get(ctor)!;
      for (const [key, meta] of Object.entries(raw)) {
        if (!merged[key]) {
          // Always copy each meta (incl. a fresh `flags` object and fresh arrays). RAW is shared
          // across bakers and re-sealed per baker; normalization in sealOne mutates `meta.flags`,
          // so it must operate on a copy and never touch the pristine RAW.
          merged[key] = {
            ...meta,
            validation: [...meta.validation],
            transform: [...meta.transform],
            expose: [...meta.expose],
            exclude: meta.exclude,
            type: meta.type,
            flags: { ...meta.flags },
          };
        } else {
          // Already exists in child → independent merge per category
          const m = merged[key];
          const p = meta;

          // validation: union merge by ruleName — child overrides parent for the same rule name (N-6)
          for (const rd of p.validation) {
            if (!m.validation.some(d => d.rule.ruleName === rd.rule.ruleName)) {
              m.validation.push(rd);
            }
          }

          // transform: inherit from parent if absent in child
          if (m.transform.length === 0 && p.transform.length > 0) {
            m.transform = [...p.transform];
          }

          // expose: inherit from parent if absent in child
          if (m.expose.length === 0 && p.expose.length > 0) {
            m.expose = [...p.expose];
          }

          // exclude: inherit from parent if absent in child
          if (m.exclude === null && p.exclude !== null) {
            m.exclude = p.exclude;
          }

          // type: inherit from parent if absent in child
          if (m.type === null && p.type !== null) {
            m.type = p.type;
          }

          // message/context: field-level options inherit from parent if absent in child (same
          // child-priority rule as the categories above — otherwise an override silently drops them).
          if (m.message === undefined && p.message !== undefined) {
            m.message = p.message;
          }
          if (m.context === undefined && p.context !== undefined) {
            m.context = p.context;
          }

          // flags: child takes priority, only supplement missing flags from parent
          const mf = m.flags;
          const pf = p.flags;
          if (pf.isOptional !== undefined && mf.isOptional === undefined) {
            mf.isOptional = pf.isOptional;
          }
          if (pf.validateIf !== undefined && mf.validateIf === undefined) {
            mf.validateIf = pf.validateIf;
          }
          if (pf.isNullable !== undefined && mf.isNullable === undefined) {
            mf.isNullable = pf.isNullable;
          }
          if (pf.validateNested !== undefined && mf.validateNested === undefined) {
            mf.validateNested = pf.validateNested;
          }
          if (pf.validateNestedEach !== undefined && mf.validateNestedEach === undefined) {
            mf.validateNestedEach = pf.validateNestedEach;
          }
        }
      }
    }

    return merged;
  }
}
