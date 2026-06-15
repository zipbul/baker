---
"@zipbul/baker": major
---

Remove the global registration API in favor of the `Baker` class. `new Baker(config?)`
is now the only way to register and seal DTOs: use `@app.Recipe` to register a class and
`app.seal()` to seal it. The global `@Recipe`, `seal()`, `configure()`, and the `createBaker()`
factory have been removed — each `Baker` instance owns its own isolated registry and config, so
multiple apps in one process never mix. `@Field`, the rule/transformer factories, and
`deserialize`/`validate`/`serialize` are unchanged.

Migration: replace `configure(opts)` + global `@Recipe`/`seal()` with
`const app = new Baker(opts); @app.Recipe class Dto {}; app.seal();`.
