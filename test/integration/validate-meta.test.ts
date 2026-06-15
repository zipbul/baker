import { describe, it, expect, beforeEach, afterEach } from 'bun:test';

import { Baker, Field } from '../../index';
import { globalRegistry } from '../../src/registry';
import { isString } from '../../src/rules/index';
import { sealClass } from './helpers/seal';
import { unseal } from './helpers/unseal';

const baker = new Baker();

beforeEach(() => baker.seal());
afterEach(() => {
  const toDelete: Function[] = [];
  for (const cls of globalRegistry) {
    toDelete.push(cls);
  }
  for (const cls of toDelete) {
    globalRegistry.delete(cls);
  }
  unseal();
});

describe('validateMeta — discriminator invariants', () => {
  it('empty property string throws BakerError', () => {
    @baker.Recipe
    class ChildA {
      @Field(isString) k!: string;
    }
    @baker.Recipe
    class BadDisc {
      @Field({ type: () => ChildA, discriminator: { property: '', subTypes: [{ value: ChildA, name: 'a' }] } })
      v!: ChildA;
    }
    expect(() => sealClass(BadDisc)).toThrow(/discriminator\.property must be a non-empty string/);
  });

  it('empty subTypes throws BakerError', () => {
    @baker.Recipe
    class EmptyDisc {
      @Field({ type: () => Object, discriminator: { property: 'k', subTypes: [] } })
      v!: unknown;
    }
    expect(() => sealClass(EmptyDisc)).toThrow(/discriminator\.subTypes must be a non-empty array/);
  });

  it('subTypes entry with empty name throws BakerError', () => {
    @baker.Recipe
    class C1 {
      @Field(isString) k!: string;
    }
    @baker.Recipe
    class BadName {
      @Field({ type: () => C1, discriminator: { property: 'k', subTypes: [{ value: C1, name: '' }] } })
      v!: C1;
    }
    expect(() => sealClass(BadName)).toThrow(/subTypes\[0\]\.name must be a non-empty string/);
  });

  it('subTypes entry with non-class value throws BakerError', () => {
    @baker.Recipe
    class BadValue {
      @Field({ type: () => Object, discriminator: { property: 'k', subTypes: [{ value: 'NotAClass' as never, name: 'a' }] } })
      v!: unknown;
    }
    expect(() => sealClass(BadValue)).toThrow(/must be a class constructor/);
  });

  it('duplicate subType names throw BakerError', () => {
    @baker.Recipe
    class D1 {
      @Field(isString) k!: string;
    }
    @baker.Recipe
    class D2 {
      @Field(isString) k!: string;
    }
    @baker.Recipe
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
    expect(() => sealClass(DupNames)).toThrow(/duplicate name 'x'/);
  });

  it('subType value without @Field decorators throws BakerError', () => {
    class NoFields {}
    @baker.Recipe
    class HasUndecoratedSub {
      @Field({ type: () => NoFields, discriminator: { property: 'k', subTypes: [{ value: NoFields, name: 'a' }] } })
      v!: NoFields;
    }
    expect(() => sealClass(HasUndecoratedSub)).toThrow(/has no @Field decorators/);
  });
});

describe('validateMeta — Set/Map collection invariants', () => {
  it('setValue target without @Field throws BakerError', () => {
    class NoFieldsItem {}
    @baker.Recipe
    class SetParent {
      @Field({ type: () => Set, setValue: () => NoFieldsItem })
      items!: Set<NoFieldsItem>;
    }
    expect(() => sealClass(SetParent)).toThrow(/setValue target.*has no @Field decorators/);
  });

  it('mapValue target without @Field throws BakerError', () => {
    class NoFieldsVal {}
    @baker.Recipe
    class MapParent {
      @Field({ type: () => Map, mapValue: () => NoFieldsVal })
      m!: Map<string, NoFieldsVal>;
    }
    expect(() => sealClass(MapParent)).toThrow(/mapValue target.*has no @Field decorators/);
  });
});
