import { describe, it, expect } from 'bun:test';

import { Baker } from '../index';
import { Field } from './decorators/field';
import { isString } from './rules/typechecker';

describe('Baker.Recipe', () => {
  it('seals a class decorated with @baker.Recipe after baker.seal()', () => {
    const baker = new Baker();
    @baker.Recipe
    class UserDto {
      @Field(isString) name!: string;
    }
    baker.seal();
    // Sealed → the baker can deserialize a valid input into a class instance.
    const result = baker.deserialize(UserDto, { name: 'Alice' });
    expect(result).toBeInstanceOf(UserDto);
    expect((result as UserDto).name).toBe('Alice');
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
    // Both classes are sealed by this baker → each deserializes its own valid input.
    expect(baker.deserialize(BaseDto, { id: 'x' })).toBeInstanceOf(BaseDto);
    expect(baker.deserialize(ChildDto, { id: 'x', age: '10' })).toBeInstanceOf(ChildDto);
  });

  it('does NOT seal a class that has @Field but no @baker.Recipe', () => {
    // @Field alone never registers the class with the baker — registration is @baker.Recipe's sole
    // job, so baker.seal() only seals @baker.Recipe-marked roots (and their nested DTOs).
    const baker = new Baker();
    class FieldOnlyDto {
      @Field(isString) name!: string;
    }
    baker.seal();
    // Not sealed by this baker → resolving it throws.
    expect(() => baker.deserialize(FieldOnlyDto, { name: 'Alice' })).toThrow(/not sealed by this baker/);
  });
});
