import { describe, it, expect, beforeEach, afterEach } from 'bun:test';

import { Field, seal } from '../../index';
import { globalRegistry } from '../../src/registry';
import { isString } from '../../src/rules/index';
import { unseal } from './helpers/unseal';

beforeEach(() => seal());
afterEach(() => {
  const toDelete: Function[] = [];
  for (const cls of globalRegistry) {toDelete.push(cls);}
  for (const cls of toDelete) {globalRegistry.delete(cls);}
  unseal();
});

describe('validateMeta — discriminator invariants', () => {
  it('empty property string throws SealError', () => {
    class ChildA {
      @Field(isString) k!: string;
    }
    class BadDisc {
      @Field({ type: () => ChildA, discriminator: { property: '', subTypes: [{ value: ChildA, name: 'a' }] } })
      v!: ChildA;
    }
    expect(() => seal(BadDisc)).toThrow(/discriminator\.property must be a non-empty string/);
  });

  it('empty subTypes throws SealError', () => {
    class EmptyDisc {
      @Field({ type: () => Object, discriminator: { property: 'k', subTypes: [] } })
      v!: unknown;
    }
    expect(() => seal(EmptyDisc)).toThrow(/discriminator\.subTypes must be a non-empty array/);
  });

  it('subTypes entry with empty name throws SealError', () => {
    class C1 {
      @Field(isString) k!: string;
    }
    class BadName {
      @Field({ type: () => C1, discriminator: { property: 'k', subTypes: [{ value: C1, name: '' }] } })
      v!: C1;
    }
    expect(() => seal(BadName)).toThrow(/subTypes\[0\]\.name must be a non-empty string/);
  });

  it('subTypes entry with non-class value throws SealError', () => {
    class BadValue {
      @Field({ type: () => Object, discriminator: { property: 'k', subTypes: [{ value: 'NotAClass' as never, name: 'a' }] } })
      v!: unknown;
    }
    expect(() => seal(BadValue)).toThrow(/must be a class constructor/);
  });

  it('duplicate subType names throw SealError', () => {
    class D1 {
      @Field(isString) k!: string;
    }
    class D2 {
      @Field(isString) k!: string;
    }
    class DupNames {
      @Field({
        type: () => D1,
        discriminator: {
          property: 'k',
          subTypes: [
            { value: D1, name: 'x' },
            { value: D2, name: 'x' },
          ],
        },
      })
      v!: D1 | D2;
    }
    expect(() => seal(DupNames)).toThrow(/duplicate name 'x'/);
  });

  it('subType value without @Field decorators throws SealError', () => {
    class NoFields {}
    class HasUndecoratedSub {
      @Field({ type: () => NoFields, discriminator: { property: 'k', subTypes: [{ value: NoFields, name: 'a' }] } })
      v!: NoFields;
    }
    expect(() => seal(HasUndecoratedSub)).toThrow(/has no @Field decorators/);
  });
});

describe('validateMeta — Set/Map collection invariants', () => {
  it('setValue target without @Field throws SealError', () => {
    class NoFieldsItem {}
    class SetParent {
      @Field({ type: () => Set, setValue: () => NoFieldsItem })
      items!: Set<NoFieldsItem>;
    }
    expect(() => seal(SetParent)).toThrow(/setValue target.*has no @Field decorators/);
  });

  it('mapValue target without @Field throws SealError', () => {
    class NoFieldsVal {}
    class MapParent {
      @Field({ type: () => Map, mapValue: () => NoFieldsVal })
      m!: Map<string, NoFieldsVal>;
    }
    expect(() => seal(MapParent)).toThrow(/mapValue target.*has no @Field decorators/);
  });
});
