import { readdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';

function walk(d: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

const files = walk('dist');
let count = 0;
for (const f of files) {
  let src = readFileSync(f, 'utf8');
  const orig = src;
  // Add .js to relative imports/exports without extensions
  // Pattern: from '...' or from "..." where ... starts with . and doesn't end in .js/.json/.css etc.
  src = src.replace(
    /(\bfrom\s*['"])(\.[^'"\n]*?)(['"])/g,
    (m, pre, path, post) => {
      if (path.endsWith('.js') || path.endsWith('.json') || path.endsWith('.css') || path.endsWith('.mjs') || path.endsWith('.cjs')) {
        return m;
      }
      // Check if path resolves to a directory (then add /index.js) or file (add .js)
      const absPath = join(f, '..', path);
      try {
        if (statSync(absPath).isDirectory()) {
          return `${pre}${path}/index.js${post}`;
        }
      } catch {}
      return `${pre}${path}.js${post}`;
    }
  );
  // Also handle dynamic imports
  src = src.replace(
    /(\bimport\s*\(['"])(\.[^'"\n]*?)(['"]\s*\))/g,
    (m, pre, path, post) => {
      if (path.endsWith('.js') || path.endsWith('.json')) return m;
      const absPath = join(f, '..', path);
      try { if (statSync(absPath).isDirectory()) return `${pre}${path}/index.js${post}`; } catch {}
      return `${pre}${path}.js${post}`;
    }
  );
  if (src !== orig) { writeFileSync(f, src); count++; }
}
console.log(`Patched ${count} files`);
