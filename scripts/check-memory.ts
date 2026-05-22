/**
 * Memory leak detection — run in CI to catch regressions.
 * Exits with code 1 if any path leaks more than 1 byte/call after JIT warmup.
 *
 * Usage: bun run scripts/check-memory.ts
 */
import { deserialize, validate, Field, Recipe, seal } from '../index';
import { isString, isNumber, min, minLength } from '../src/rules/index';

// ── DTO setup ────────────────────────────────────────────────────────────────

@Recipe
class MemDto {
  @Field(isString, minLength(2)) name!: string;
  @Field(isNumber(), min(0)) age!: number;
}

// Seal
seal();
deserialize(MemDto, { name: 'Alice', age: 30 });

// ── JIT warmup ───────────────────────────────────────────────────────────────

for (let i = 0; i < 100_000; i++) {
  deserialize(MemDto, { name: 'Alice', age: 30 });
  deserialize(MemDto, { name: 'A', age: -1 });
  validate(MemDto, { name: 'Alice', age: 30 });
}

// ── Measurement ──────────────────────────────────────────────────────────────

const ITERATIONS = 500_000;
const THRESHOLD_BYTES_PER_CALL = 1;

interface TestCase {
  label: string;
  fn: () => void;
}

const cases: TestCase[] = [
  {
    label: 'deserialize valid',
    fn: () => {
      deserialize(MemDto, { name: 'Alice', age: 30 });
    },
  },
  {
    label: 'deserialize invalid',
    fn: () => {
      deserialize(MemDto, { name: 'A', age: -1 });
    },
  },
  {
    label: 'validate DTO valid',
    fn: () => {
      validate(MemDto, { name: 'Alice', age: 30 });
    },
  },
  {
    label: 'validate DTO invalid',
    fn: () => {
      validate(MemDto, { name: 'A', age: -1 });
    },
  },
];

let failed = false;

for (const { label, fn } of cases) {
  Bun.gc(true);
  Bun.gc(true);
  const before = process.memoryUsage().heapUsed;

  for (let i = 0; i < ITERATIONS; i++) {
    fn();
  }

  Bun.gc(true);
  Bun.gc(true);
  const after = process.memoryUsage().heapUsed;
  const bytesPerCall = (after - before) / ITERATIONS;

  const status = bytesPerCall > THRESHOLD_BYTES_PER_CALL ? 'FAIL' : 'PASS';
  if (status === 'FAIL') {
    failed = true;
  }
  console.log(`[${status}] ${label}: ${bytesPerCall.toFixed(3)} bytes/call (${ITERATIONS} iterations)`);
}

if (failed) {
  console.error('\nMemory leak detected! Threshold: ' + THRESHOLD_BYTES_PER_CALL + ' bytes/call');
  process.exit(1);
}

console.log('\nAll memory checks passed.');
