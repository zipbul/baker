import { describe, it, expect } from 'bun:test';
import { deserialize, serialize, SealError, Field } from '../../index';
import { isString } from '../../src/rules/index';
import { ensureMeta } from '../../src/collect';

// ─────────────────────────────────────────────────────────────────────────────

describe('SealError', () => {
  it('deserialize on class without @Field → SealError', async () => {
    class NoFieldDto {}
    await expect(
      deserialize(NoFieldDto, { name: 'Alice' }),
    ).rejects.toThrow(SealError);
  });

  it('serialize on class without @Field → SealError', async () => {
    class NoFieldDto2 {}
    const dto = new NoFieldDto2();
    await expect(serialize(dto)).rejects.toThrow(SealError);
  });

  it('banned field name "__proto__" throws SealError during auto-seal', async () => {
    class ProtoDto {}
    // Manually register a banned field name via ensureMeta to simulate the scenario
    ensureMeta(ProtoDto, '__proto__');
    await expect(
      deserialize(ProtoDto, { '__proto__': 'evil' }),
    ).rejects.toThrow(SealError);
  });

  it('banned field name "constructor" throws SealError during auto-seal', async () => {
    class CtorDto {}
    ensureMeta(CtorDto, 'constructor');
    await expect(
      deserialize(CtorDto, { constructor: 'evil' }),
    ).rejects.toThrow(SealError);
  });
});
