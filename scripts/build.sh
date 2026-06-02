#!/usr/bin/env bash
#
# Unified library build (Bun-first).
#
#   JS    : bun build --no-bundle, one file at a time (per-file ESM, import graph
#           preserved → consumer tree-shaking). --production = full minify
#           (enum inlining, constant folding, DCE, whitespace + identifier mangling).
#           Smallest published bytes; baker is minify-safe (no reliance on its own
#           function/class .name — verified). Readability of a node_modules dist is
#           irrelevant, and consumers re-minify anyway, so nothing downstream is lost.
#   TYPES : tsc --emitDeclarationOnly (bun build does not generate .d.ts).
#   FIXUP : add .js extensions to relative imports (bun emits extensionless;
#           spec-compliant ESM needs them).
#
# Why per-file loop instead of `--outdir`: `bun build --no-bundle --outdir` is
# currently broken (writes empty paths / ENOENT). Bundling modes are NOT used for
# libraries — splitting DCEs the re-export barrels and plain bundling duplicates
# shared code into every entry. Per-file --no-bundle is the only mode that emits a
# valid, non-duplicated, tree-shakeable dist.
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

OUT="dist"
TARGET="bun"

echo "▸ clean"
rm -rf "$OUT"

echo "▸ JS  (bun build --no-bundle, per file)"
# All buildable sources: root index.ts + src/**, excluding tests.
while IFS= read -r f; do
  out="$OUT/${f%.ts}.js"
  mkdir -p "$(dirname "$out")"
  bun build "$f" \
    --no-bundle \
    --target="$TARGET" \
    --format=esm \
    --production \
    --outfile "$out" >/dev/null
done < <(find index.ts src -name '*.ts' ! -name '*.spec.ts' ! -name '*.test.ts')

echo "▸ TYPES  (tsc --emitDeclarationOnly)"
bunx tsc -p tsconfig.build.json --emitDeclarationOnly

echo "▸ FIXUP  (.js extensions on relative imports)"
bun scripts/add-js-extensions.ts

echo "▸ done → $OUT ($(find "$OUT" -name '*.js' | wc -l | tr -d ' ') js, $(find "$OUT" -name '*.d.ts' | wc -l | tr -d ' ') d.ts)"
