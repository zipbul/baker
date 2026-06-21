import { describe, it, expect } from 'bun:test';

import type { RawClassMeta, RawPropertyMeta } from '../metadata';

import { BakerError } from '../common';
import { CollectionType, metaStore } from '../metadata';
import { MetaValidator } from './meta-validator';

const validator = new MetaValidator(metaStore);

function prop(over: Partial<RawPropertyMeta> = {}): RawPropertyMeta {
  return { validation: [], transform: [], expose: [], exclude: null, type: null, flags: {}, ...over };
}

// A class WITH @Field metadata, used as a valid discriminator subtype / collection value target.
class Sub {}
metaStore.set(Sub, { x: prop() });

function disc(d: { property: string; subTypes: { value: Function; name: string }[] }): RawClassMeta {
  return { f: prop({ type: { fn: () => Sub, discriminator: d } }) };
}

describe('MetaValidator.validateShape', () => {
  class Host {}

  it('passes a valid discriminator', () => {
    expect(() => validator.validateShape(Host, disc({ property: 'type', subTypes: [{ value: Sub, name: 'sub' }] }))).not.toThrow();
  });

  it('rejects an empty discriminator property', () => {
    expect(() => validator.validateShape(Host, disc({ property: '', subTypes: [{ value: Sub, name: 's' }] }))).toThrow(BakerError);
  });

  it('rejects a reserved discriminator property (prototype-pollution vector)', () => {
    expect(() => validator.validateShape(Host, disc({ property: '__proto__', subTypes: [{ value: Sub, name: 's' }] }))).toThrow(/reserved/);
  });

  it('rejects empty subTypes', () => {
    expect(() => validator.validateShape(Host, disc({ property: 'type', subTypes: [] }))).toThrow(/non-empty array/);
  });

  it('rejects a subType with a non-string name', () => {
    expect(() => validator.validateShape(Host, disc({ property: 'type', subTypes: [{ value: Sub, name: '' }] }))).toThrow(/name must be/);
  });

  it('rejects a subType whose value is not a constructor', () => {
    expect(() => validator.validateShape(Host, disc({ property: 'type', subTypes: [{ value: 123 as never, name: 'x' }] }))).toThrow(
      /class constructor/,
    );
  });

  it('rejects duplicate subType names', () => {
    const subTypes = [
      { value: Sub, name: 'dup' },
      { value: Sub, name: 'dup' },
    ];
    expect(() => validator.validateShape(Host, disc({ property: 'type', subTypes }))).toThrow(/duplicate name/);
  });

  it('rejects a subType class without @Field metadata', () => {
    class Bare {}
    expect(() => validator.validateShape(Host, disc({ property: 'type', subTypes: [{ value: Bare, name: 'bare' }] }))).toThrow(/no @Field/);
  });

  it('rejects a Set value-class target without @Field metadata', () => {
    class Bare {}
    const merged: RawClassMeta = {
      f: prop({ type: { fn: () => Set, collection: CollectionType.Set, resolvedCollectionValue: Bare } }),
    };
    expect(() => validator.validateShape(Host, merged)).toThrow(/no @Field/);
  });

  it('passes when a Set value-class target has @Field metadata', () => {
    const merged: RawClassMeta = {
      f: prop({ type: { fn: () => Set, collection: CollectionType.Set, resolvedCollectionValue: Sub } }),
    };
    expect(() => validator.validateShape(Host, merged)).not.toThrow();
  });
});
