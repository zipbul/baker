import { describe, it, expect } from 'bun:test';

import type { RawPropertyMeta } from '../metadata';

import { metaStore } from '../metadata';
import { isString, isInt } from '../rules/typechecker';
import { InheritanceMerger } from './inheritance-merger';

const merger = new InheritanceMerger(metaStore);

function prop(over: Partial<RawPropertyMeta> = {}): RawPropertyMeta {
  return { validation: [], transform: [], expose: [], exclude: null, type: null, flags: {}, ...over };
}

describe('InheritanceMerger', () => {
  it('returns a class own metadata when there is no decorated parent', () => {
    class A {}
    metaStore.set(A, { name: prop({ validation: [{ rule: isString }] }) });
    const merged = merger.merge(A);
    expect(Object.keys(merged)).toEqual(['name']);
    expect(merged.name!.validation).toHaveLength(1);
  });

  it('union-merges validation rules across the prototype chain', () => {
    class Base {}
    metaStore.set(Base, { name: prop({ validation: [{ rule: isString }] }) });
    class Child extends Base {}
    metaStore.set(Child, { name: prop({ validation: [{ rule: isInt }] }) });
    const names = merger.merge(Child).name!.validation.map(rd => rd.rule.ruleName);
    expect(names).toContain('isString');
    expect(names).toContain('isInt');
  });

  it('does not duplicate a rule with the same ruleName (child wins)', () => {
    class Base {}
    metaStore.set(Base, { name: prop({ validation: [{ rule: isString }] }) });
    class Child extends Base {}
    const childRule = { rule: isString };
    metaStore.set(Child, { name: prop({ validation: [childRule] }) });
    const merged = merger.merge(Child);
    expect(merged.name!.validation).toHaveLength(1);
    expect(merged.name!.validation[0]).toBe(childRule);
  });

  it('inherits transform/exclude/type from the parent when absent in the child', () => {
    class Base {}
    metaStore.set(Base, {
      f: prop({ transform: [{ fn: v => v }], exclude: { serializeOnly: true }, type: { fn: () => class {} } }),
    });
    class Child extends Base {}
    metaStore.set(Child, { f: prop({ validation: [{ rule: isString }] }) });
    const merged = merger.merge(Child);
    expect(merged.f!.transform).toHaveLength(1);
    expect(merged.f!.exclude).toEqual({ serializeOnly: true });
    expect(merged.f!.type).not.toBeNull();
  });

  it('keeps the child transform when present (child priority)', () => {
    const childFn = (v: unknown): unknown => v;
    class Base {}
    metaStore.set(Base, { f: prop({ transform: [{ fn: v => v }] }) });
    class Child extends Base {}
    metaStore.set(Child, { f: prop({ transform: [{ fn: childFn }] }) });
    expect(merger.merge(Child).f!.transform[0]!.fn).toBe(childFn);
  });

  it('supplements only missing flags from the parent', () => {
    class Base {}
    metaStore.set(Base, { f: prop({ flags: { isOptional: true, isNullable: true } }) });
    class Child extends Base {}
    metaStore.set(Child, { f: prop({ flags: { isOptional: false } }) });
    const flags = merger.merge(Child).f!.flags;
    expect(flags.isOptional).toBe(false); // child wins
    expect(flags.isNullable).toBe(true); // supplemented from parent
  });

  it('returns deep copies so mutating the merged result never touches pristine RAW', () => {
    class A {}
    const raw = { f: prop({ validation: [{ rule: isString }] }) };
    metaStore.set(A, raw);
    merger.merge(A).f!.validation.push({ rule: isInt });
    expect(raw.f.validation).toHaveLength(1);
  });
});
