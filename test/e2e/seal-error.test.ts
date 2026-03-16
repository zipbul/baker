import { describe, it, expect, afterEach } from 'bun:test';
import { deserialize, serialize, SealError } from '../../index';
import { ensureMeta } from '../../src/collect';
import { globalRegistry } from '../../src/registry';
import { unseal } from '../integration/helpers/unseal';

// ─────────────────────────────────────────────────────────────────────────────

describe('SealError', () => {
  // 매 테스트 후 poison 클래스 제거 + seal 상태 리셋
  afterEach(() => {
    // poison 클래스(banned field 등)를 registry에서 제거
    for (const cls of [...globalRegistry]) {
      globalRegistry.delete(cls);
    }
    unseal();
  });

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
