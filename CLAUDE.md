# baker

`@zipbul/baker` is a TypeScript library that validates and serializes decorator-defined classes, built around ahead-of-time (AOT) compilation: rather than interpreting rules on every call, it compiles each class once at seal time into an optimized executor function and reuses it on every subsequent call, and it runs only on Bun.
