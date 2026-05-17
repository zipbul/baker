#!/usr/bin/env bun
// Move all `import` statements to the top of bench files, preserving order.
import { readFileSync, writeFileSync } from 'node:fs';

const files = [
  'bench/cold.bench.ts',
  'bench/array.bench.ts',
  'bench/error.bench.ts',
  'bench/nested.bench.ts',
  'bench/simple.bench.ts',
  'bench/validate-only.bench.ts',
];

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const lines = src.split('\n');

  type Block = { kind: 'import' | 'other'; lines: string[] };
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const ln = lines[i]!;
    if (/^import\s/.test(ln)) {
      const start = i;
      // multi-line import? consume until matching ;
      let buf = ln;
      while (!buf.trimEnd().endsWith(';') && i + 1 < lines.length) {
        i += 1;
        buf += '\n' + lines[i];
      }
      blocks.push({ kind: 'import', lines: lines.slice(start, i + 1) });
      i += 1;
      continue;
    }
    blocks.push({ kind: 'other', lines: [ln] });
    i += 1;
  }

  // First leading comment block (header) stays at the very top, then all imports, then rest.
  const out: string[] = [];
  let cursor = 0;
  while (cursor < blocks.length && blocks[cursor]!.kind === 'other' && blocks[cursor]!.lines[0]!.startsWith('//')) {
    out.push(...blocks[cursor]!.lines);
    cursor += 1;
  }
  const imports: string[] = [];
  const rest: string[] = [];
  for (let k = cursor; k < blocks.length; k++) {
    const b = blocks[k]!;
    if (b.kind === 'import') {
      imports.push(...b.lines);
    } else {
      rest.push(...b.lines);
    }
  }
  out.push(...imports, ...rest);
  writeFileSync(file, out.join('\n'));
  console.log(`fixed: ${file}`);
}
