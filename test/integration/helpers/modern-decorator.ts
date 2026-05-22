// Test helpers: apply modern decorators to a class programmatically, mirroring what the
// runtime does. `applyField` is field-only (exactly like `@Field`); `applyRecipe` registers
// the class (exactly like `@Recipe`). They are kept separate so tests can exercise the real
// @Field/@Recipe split — e.g. that @Field alone does NOT make a class discoverable by seal().
import { globalRegistry } from '../../../src/registry';

type FieldDecorator = (value: undefined, context: ClassFieldDecoratorContext) => void;

function ownMetadata(ctor: Function): Record<PropertyKey, unknown> {
  if (!Object.hasOwn(ctor, Symbol.metadata)) {
    Object.defineProperty(ctor, Symbol.metadata, {
      value: {} as Record<PropertyKey, unknown>,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
  return (ctor as { [Symbol.metadata]?: Record<PropertyKey, unknown> })[Symbol.metadata]!;
}

/** Apply a `@Field(...)` decorator to ctor[key] as the runtime would. Field-only — no registration. */
export function applyField(decorator: FieldDecorator, ctor: Function, key: string): void {
  const metadata = ownMetadata(ctor);
  decorator(undefined, {
    kind: 'field',
    name: key,
    static: false,
    private: false,
    metadata,
    access: { has: () => false, get: () => undefined, set: () => undefined },
    addInitializer: () => undefined,
  } as ClassFieldDecoratorContext);
}

/** Register a class for argless seal() discovery, exactly as `@Recipe` does. */
export function applyRecipe(ctor: Function): void {
  globalRegistry.add(ctor);
}
