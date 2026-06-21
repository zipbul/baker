import { describe, it, expect } from 'bun:test';

import type { RawClassMeta, RawPropertyMeta } from '../metadata';
import type { SealedExecutors } from './interfaces';

import { Direction } from '../common';
import { metaStore } from '../metadata';
import { isString } from '../rules/typechecker';
import { AsyncAnalyzer } from './async-analyzer';
import { InheritanceMerger } from './inheritance-merger';

const merger = new InheritanceMerger(metaStore);
const noResolve = (): SealedExecutors<unknown> | undefined => undefined;
const analyzer = new AsyncAnalyzer(noResolve, merger);

function prop(over: Partial<RawPropertyMeta> = {}): RawPropertyMeta {
  return { validation: [], transform: [], expose: [], exclude: null, type: null, flags: {}, ...over };
}

const asyncRule = { rule: { ruleName: 'asyncStub', isAsync: true } } as never;

describe('AsyncAnalyzer.analyze', () => {
  it('returns false for sync-only metadata', () => {
    expect(analyzer.analyze({ f: prop({ validation: [{ rule: isString }] }) }, Direction.Deserialize)).toBe(false);
  });

  it('detects an async validation rule (deserialize direction)', () => {
    expect(analyzer.analyze({ f: prop({ validation: [asyncRule] }) }, Direction.Deserialize)).toBe(true);
  });

  it('ignores async validation rules in the serialize direction', () => {
    expect(analyzer.analyze({ f: prop({ validation: [asyncRule] }) }, Direction.Serialize)).toBe(false);
  });

  it('detects an async transform via the isAsync flag', () => {
    const merged = { f: prop({ transform: [{ fn: v => v, isAsync: true }] }) };
    expect(analyzer.analyze(merged, Direction.Deserialize)).toBe(true);
  });

  it('detects an async transform via isAsyncFunction(fn) when no flag is set', () => {
    const merged = { f: prop({ transform: [{ fn: async v => await v }] }) };
    expect(analyzer.analyze(merged, Direction.Deserialize)).toBe(true);
  });

  it('skips a serializeOnly transform in the deserialize direction', () => {
    const merged = { f: prop({ transform: [{ fn: v => v, isAsync: true, options: { serializeOnly: true } }] }) };
    expect(analyzer.analyze(merged, Direction.Deserialize)).toBe(false);
  });

  it('propagates async from a nested DTO through the resolver flag', () => {
    class Nested {}
    const asyncSealed = { isAsync: true, isSerializeAsync: false, merged: {} } as unknown as SealedExecutors<unknown>;
    const resolved = new Map<Function, SealedExecutors<unknown>>([[Nested, asyncSealed]]);
    const a = new AsyncAnalyzer(cls => resolved.get(cls), merger);
    const merged: RawClassMeta = { child: prop({ type: { fn: () => Nested, resolvedClass: Nested } }) };
    expect(a.analyze(merged, Direction.Deserialize)).toBe(true);
  });
});

describe('AsyncAnalyzer.nestedClassesOf', () => {
  it('collects resolvedClass, resolvedCollectionValue, and discriminator subtypes', () => {
    class C1 {}
    class C2 {}
    class C3 {}
    const meta = prop({
      type: {
        fn: () => C1,
        resolvedClass: C1,
        resolvedCollectionValue: C2,
        discriminator: { property: 't', subTypes: [{ value: C3, name: 'c3' }] },
      },
    });
    expect(analyzer.nestedClassesOf(meta)).toEqual([C1, C2, C3]);
  });

  it('returns [] for a field with no type', () => {
    expect(analyzer.nestedClassesOf(prop())).toEqual([]);
  });

  it('falls back to the fn() thunk for a Set value class, excluding primitives', () => {
    class Item {}
    const meta = prop({ type: { fn: () => Set, collectionValue: () => Item } });
    expect(analyzer.nestedClassesOf(meta)).toEqual([Item]);
  });
});
