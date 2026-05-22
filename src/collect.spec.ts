import { describe, it, expect } from 'bun:test';

import { ensureMeta } from './collect';
import { RAW } from './symbols';

type MetaObject = Record<PropertyKey, unknown>;

describe('collect', () => {
  it('should create the RAW slot on the metadata object when calling ensureMeta for the first time', () => {
    const metadata: MetaObject = {};
    ensureMeta(metadata, 'prop');
    expect(metadata[RAW]).toBeDefined();
  });

  it('should reuse the existing RAW object when calling ensureMeta again on the same metadata', () => {
    const metadata: MetaObject = {};
    ensureMeta(metadata, 'prop');
    const rawBefore = metadata[RAW];
    ensureMeta(metadata, 'other');
    expect(metadata[RAW]).toBe(rawBefore);
  });

  it('should create a fresh own RAW when the parent metadata is inherited via the prototype chain', () => {
    const parent: MetaObject = {};
    ensureMeta(parent, 'p');
    const child: MetaObject = Object.create(parent) as MetaObject;
    ensureMeta(child, 'c');
    expect(Object.hasOwn(child, RAW)).toBe(true);
    expect(child[RAW]).not.toBe(parent[RAW]);
  });

  it('should create default meta for a new key', () => {
    const metadata: MetaObject = {};
    const meta = ensureMeta(metadata, 'newProp');
    expect(meta).toBeDefined();
    expect(meta.validation).toEqual([]);
  });

  it('should return the same meta object for an already-registered key', () => {
    const metadata: MetaObject = {};
    const first = ensureMeta(metadata, 'prop');
    const second = ensureMeta(metadata, 'prop');
    expect(first).toBe(second);
  });

  it('should have the correct default shape', () => {
    const metadata: MetaObject = {};
    const meta = ensureMeta(metadata, 'prop');
    expect(meta.validation).toEqual([]);
    expect(meta.transform).toEqual([]);
    expect(meta.expose).toEqual([]);
    expect(meta.exclude).toBeNull();
    expect(meta.type).toBeNull();
    expect(meta.flags).toEqual({});
  });
});
