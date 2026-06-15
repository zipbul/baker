import { describe, it, expect } from 'bun:test';

import { Baker } from '../../index';
import { getSealed } from '../meta-access';
import { isString } from '../rules/typechecker';
import { Field } from './field';

describe('Baker.Recipe', () => {
  it('seals a class decorated with @baker.Recipe after baker.seal()', () => {
    const baker = new Baker();
    @baker.Recipe
    class UserDto {
      @Field(isString) name!: string;
    }
    baker.seal();
    expect(getSealed(UserDto)).toBeDefined();
  });

  it('seals each class independently across an inheritance chain', () => {
    const baker = new Baker();
    @baker.Recipe
    class BaseDto {
      @Field(isString) id!: string;
    }
    @baker.Recipe
    class ChildDto extends BaseDto {
      @Field(isString) age!: string;
    }
    baker.seal();
    expect(getSealed(BaseDto)).toBeDefined();
    expect(getSealed(ChildDto)).toBeDefined();
  });

  it('does NOT seal a class that has @Field but no @baker.Recipe', () => {
    // @Field alone never registers the class with the baker — registration is @Recipe's sole job,
    // so seal() only seals @Recipe-marked roots (and their nested DTOs).
    const baker = new Baker();
    class FieldOnlyDto {
      @Field(isString) name!: string;
    }
    baker.seal();
    expect(getSealed(FieldOnlyDto)).toBeUndefined();
  });
});
