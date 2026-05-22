import { describe, it, expect, afterEach } from 'bun:test';

import { globalRegistry } from '../registry';
import { Field } from './field';
import { Recipe } from './recipe';

const created: Function[] = [];
function track<T extends Function>(c: T): T {
  created.push(c);
  return c;
}

afterEach(() => {
  for (const c of created) {
    globalRegistry.delete(c);
  }
  created.length = 0;
});

describe('@Recipe', () => {
  it('registers the decorated class in the global registry', () => {
    @Recipe
    class UserDto {
      @Field() name!: string;
    }
    track(UserDto);
    expect(globalRegistry.has(UserDto)).toBe(true);
  });

  it('registers each class independently across an inheritance chain', () => {
    @Recipe
    class BaseDto {
      @Field() id!: string;
    }
    @Recipe
    class ChildDto extends BaseDto {
      @Field() age!: number;
    }
    track(BaseDto);
    track(ChildDto);
    expect(globalRegistry.has(BaseDto)).toBe(true);
    expect(globalRegistry.has(ChildDto)).toBe(true);
  });

  it('does NOT register a class that has @Field but no @Recipe', () => {
    // @Field alone never touches the registry — registration is @Recipe's sole job. This is the
    // contract that makes argless seal() discover only @Recipe-marked DTOs.
    class FieldOnlyDto {
      @Field() name!: string;
    }
    track(FieldOnlyDto);
    expect(globalRegistry.has(FieldOnlyDto)).toBe(false);
  });
});
