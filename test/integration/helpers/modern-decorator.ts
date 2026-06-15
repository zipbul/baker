// Test helper: apply a modern `@Field(...)` decorator to a class programmatically, mirroring what
// the runtime does (field-only). Registration is done per-Baker via `new Baker().Recipe`.
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
