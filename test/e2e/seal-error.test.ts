import { describe, it, expect, afterEach } from 'bun:test';
import { deserialize, serialize, SealError } from '../../index';
import { ensureMeta } from '../../src/collect';
import { globalRegistry } from '../../src/registry';
import { unseal } from '../integration/helpers/unseal';

// ─────────────────────────────────────────────────────────────────────────────

describe('SealError', () => {
  // After each test, remove poison classes from registry + reset seal state
  afterEach(() => {
    // Remove poison classes (banned fields etc.) from registry
    for (const cls of [...globalRegistry]) {
      globalRegistry.delete(cls);
    }
    unseal();
  });

  it('deserialize on class without @Field → SealError', () => {
    class NoFieldDto {}
    expect(() => deserialize(NoFieldDto, { name: 'Alice' })).toThrow(SealError);
  });

  it('serialize on class without @Field → SealError', () => {
    class NoFieldDto2 {}
    const dto = new NoFieldDto2();
    expect(() => serialize(dto)).toThrow(SealError);
  });

  it('banned field name "__proto__" throws SealError during auto-seal', () => {
    class ProtoDto {}
    ensureMeta(ProtoDto, '__proto__');
    expect(() => deserialize(ProtoDto, { '__proto__': 'evil' })).toThrow(SealError);
  });

  it('banned field name "constructor" throws SealError during auto-seal', () => {
    class CtorDto {}
    ensureMeta(CtorDto, 'constructor');
    expect(() => deserialize(CtorDto, { constructor: 'evil' })).toThrow(SealError);
  });

  it('serialize null → SealError', () => {
    expect(() => serialize(null as any)).toThrow(SealError);
  });

  it('serialize primitive → SealError', () => {
    expect(() => serialize(42 as any)).toThrow(SealError);
  });

  it('serialize undefined → SealError', () => {
    expect(() => serialize(undefined as any)).toThrow(SealError);
  });
});
