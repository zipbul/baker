---
"@zipbul/baker": minor
---

Add `createBaker()` for multi-app isolation. Each scope owns its own registration and config, so
multiple apps in one process — or a bundler-duplicated copy of baker — no longer fragment `seal()`
(the previous "`<Class> is not sealed`" failure). Use:

```ts
const app = createBaker({ autoConvert: true });
@app.Recipe class UserDto { @Field(isString) name!: string }
app.seal();
deserialize(UserDto, input);
```

`@Field`, rules, and `deserialize/serialize/validate` stay global. Distinct classes are fully
isolated (each sealed with its scope's config); a class shared across scopes is reused as one sealed
form. Single-app code is unchanged — global `@Recipe` / `seal()` / `configure()` still work. Exports
`createBaker` and the `Baker` type.
