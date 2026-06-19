#!/usr/bin/env bun
// For each file, strip `export ` keyword from inline top-level declarations
// (function/const/let/class/interface/type/enum) and add consolidated
// `export { ... }` / `export type { ... }` block at the end.
// Re-exports (`export { x } from '...'`) and `export *` are kept in place at end.
import { readFileSync, writeFileSync } from 'fs';

const files = [
  'src/rules/string.ts',
  'src/rule-plan.ts',
  'src/rules/array.ts',
  'src/rules/locales.ts',
  'src/runtime/validate.ts',
  'src/decorators/field.ts',
  'src/seal/deserialize-builder.ts',
  'src/seal/serialize-builder.ts',
  'src/seal/expose-validator.ts',
  'src/configure.ts',
];

const declRe = /^export\s+(async\s+function|function|const|let|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/;

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const lines = src.split('\n');
  const valueNames: string[] = [];
  const typeNames: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const ln = lines[i]!;
    const m = ln.match(declRe);
    if (!m) {
      continue;
    }
    const kind = m[1]!;
    const name = m[2]!;
    if (kind === 'interface' || kind === 'type') {
      if (!typeNames.includes(name)) {
        typeNames.push(name);
      }
    } else if (!valueNames.includes(name)) {
      valueNames.push(name);
    }
    lines[i] = ln.replace(/^export\s+/, '');
  }

  if (valueNames.length === 0 && typeNames.length === 0) {
    console.log(`no-op: ${file}`);
    continue;
  }

  const out = lines.join('\n').replace(/\s*$/, '\n');
  const tail: string[] = [];
  if (valueNames.length > 0) {
    tail.push(`export { ${valueNames.join(', ')} };`);
  }
  if (typeNames.length > 0) {
    tail.push(`export type { ${typeNames.join(', ')} };`);
  }
  writeFileSync(file, out + tail.join('\n') + '\n');
  console.log(`fixed: ${file} (${valueNames.length} value, ${typeNames.length} type)`);
}
