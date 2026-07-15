# Benchmarks

Two suites, run separately:

- `bun run bench` — baker vs zod / valibot / ajv / TypeBox / ArkType (`bench/*.bench.ts`), plus the `proof-*.bench.ts` micro-benchmarks used to validate internal optimization hypotheses.
- `bun run bench:cv` — baker's scenarios re-implemented with class-validator + class-transformer (`bench/class-validator/*.cv.bench.ts`).

## Why class-validator lives in its own directory — and must run from it

class-validator requires **legacy** (`experimentalDecorators`) decorators, while baker uses **native TC39** decorators; the two cannot coexist in one process. Bun also resolves `tsconfig.json` from the working directory, so running a `*.cv.bench.ts` file from the repo root applies the root tsconfig (native decorators) and crashes inside class-validator (`TypeError: undefined is not an object` in `ValidateBy`). The `bench:cv` script `cd`s into `bench/class-validator/` so its own tsconfig (`experimentalDecorators: true`) applies. Run those files from that directory, never from the root.
