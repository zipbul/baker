import { describe, it, expect } from 'bun:test';

import { BakerError } from '../errors';
import { isString } from '../rules/index';
import { Field } from './field';

// Build a faithful ClassFieldDecoratorContext so the @Field runtime guards can be exercised
// directly — the field's static/private/name flags are exactly what the runtime supplies.
function fieldContext(overrides: Partial<ClassFieldDecoratorContext>): ClassFieldDecoratorContext {
  return {
    kind: 'field',
    name: 'x',
    static: false,
    private: false,
    metadata: {} as DecoratorMetadata,
    access: { has: () => false, get: () => undefined, set: () => undefined },
    addInitializer: () => undefined,
    ...overrides,
  } as ClassFieldDecoratorContext;
}

describe('@Field — target guards', () => {
  it('rejects a static field', () => {
    expect(() => Field(isString)(undefined, fieldContext({ static: true }))).toThrow(/cannot decorate static fields/);
  });

  it('rejects a private field', () => {
    expect(() => Field(isString)(undefined, fieldContext({ private: true }))).toThrow(/cannot decorate private fields/);
  });

  it('rejects a symbol-named field', () => {
    expect(() => Field(isString)(undefined, fieldContext({ name: Symbol('s') }))).toThrow(
      /symbol property keys are not supported/,
    );
  });

  it('rejects combining name with deserializeName/serializeName', () => {
    expect(() => Field({ name: 'wire', deserializeName: 'in' })(undefined, fieldContext({}))).toThrow(BakerError);
    expect(() => Field({ name: 'wire', serializeName: 'out' })(undefined, fieldContext({}))).toThrow(/cannot be combined/);
  });

  it('accepts a normal instance field', () => {
    expect(() => Field(isString)(undefined, fieldContext({ name: 'name' }))).not.toThrow();
  });
});
