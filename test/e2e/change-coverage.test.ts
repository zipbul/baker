import { describe, it, expect, afterEach } from 'bun:test';
import {
  deserialize, validate, isBakerError, Field, createRule,
  SealError, configure,
} from '../../index';
import { isString, isNumber } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';
import { _toBakerErrors } from '../../src/errors';
import { _runSealed } from '../../src/functions/_run-sealed';

afterEach(() => { unseal(); configure({}); });

// ═════════════════════════════════════════════════════════════════════════════
// 1. _runSealed — async/sync executor paths
// ═════════════════════════════════════════════════════════════════════════════

describe('_runSealed — async executor success', () => {
  class AsyncDto {
    @Field(isString, { transform: { deserialize: async ({ value }) => (value as string).toUpperCase(), serialize: ({ value }) => value } })
    name!: string;
  }

  it('async executor returning success calls onSuccess', async () => {
    const result = await _runSealed(AsyncDto, { name: 'hello' }, undefined, (r) => r);
    expect(result).toBeInstanceOf(AsyncDto);
    expect((result as any).name).toBe('HELLO');
  });
});

describe('_runSealed — async executor returning error', () => {
  class AsyncErrDto {
    @Field(isString, { transform: { deserialize: async ({ value }) => value, serialize: ({ value }) => value } })
    name!: string;
  }

  it('async executor with invalid input returns BakerErrors', async () => {
    const result = await _runSealed(AsyncErrDto, null, undefined, (r) => r);
    expect(isBakerError(result)).toBe(true);
  });
});

describe('_runSealed — sync executor success', () => {
  class SyncDto {
    @Field(isString) name!: string;
  }

  it('sync executor returning success calls onSuccess', () => {
    const result = _runSealed(SyncDto, { name: 'hi' }, undefined, () => true as const);
    expect(result).toBe(true);
  });
});

describe('_runSealed — sync executor returning error', () => {
  class SyncErrDto {
    @Field(isString) name!: string;
  }

  it('sync executor with invalid input returns BakerErrors', () => {
    const result = _runSealed(SyncErrDto, null, undefined, (r) => r);
    expect(isBakerError(result)).toBe(true);
  });
});

describe('_runSealed — SealError from _ensureSealed', () => {
  it('class without @Field throws SealError', () => {
    class NoFieldDto {}
    expect(() => _runSealed(NoFieldDto, {}, undefined, (r) => r)).toThrow(SealError);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. deserialize-builder — WeakSet circular fix
// ═════════════════════════════════════════════════════════════════════════════

class Node {
  @Field(isString) value!: string;
  @Field({ optional: true, type: () => Node }) child?: Node;
}

describe('WeakSet circular fix — same object deserialized twice', () => {
  it('same plain object deserialized twice succeeds both times', async () => {
    const input = { value: 'a', child: { value: 'b' } };
    const r1 = await deserialize(Node, input);
    expect(isBakerError(r1)).toBe(false);
    unseal();
    const r2 = await deserialize(Node, input);
    expect(isBakerError(r2)).toBe(false);
  });
});

describe('WeakSet circular fix — actual circular reference detected', () => {
  it('self-referencing object produces circular error', async () => {
    const circular: any = { value: 'a' };
    circular.child = circular;
    const result = await deserialize(Node, circular);
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors.some(e => e.code === 'circular')).toBe(true);
    }
  });
});

describe('WeakSet circular fix — nested circular (A->B->A)', () => {
  it('A.child=B, B.child=A produces circular error', async () => {
    const a: any = { value: 'a' };
    const b: any = { value: 'b' };
    a.child = b;
    b.child = a;
    const result = await deserialize(Node, a);
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors.some(e => e.code === 'circular')).toBe(true);
    }
  });
});

describe('WeakSet circular fix — object used in two different DTOs', () => {
  class ParentA {
    @Field(isString) id!: string;
    @Field({ type: () => Node }) node!: Node;
  }

  class ParentB {
    @Field(isString) id!: string;
    @Field({ type: () => Node }) node!: Node;
  }

  it('same nested object in two different DTOs does not false-circular', async () => {
    const shared = { value: 'shared' };
    const r1 = await deserialize(ParentA, { id: 'a', node: shared });
    expect(isBakerError(r1)).toBe(false);
    const r2 = await deserialize(ParentB, { id: 'b', node: shared });
    expect(isBakerError(r2)).toBe(false);
  });
});

describe('WeakSet circular fix — parallel calls with same object', () => {
  it('concurrent deserializations of same object do not interfere', async () => {
    const input = { value: 'parallel', child: { value: 'leaf' } };
    const [r1, r2] = await Promise.all([
      deserialize(Node, input),
      deserialize(Node, input),
    ]);
    expect(isBakerError(r1)).toBe(false);
    expect(isBakerError(r2)).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. deserialize-builder — Object.create(prototype)
// ═════════════════════════════════════════════════════════════════════════════

class ProtoDto {
  @Field(isString) name!: string;
  greeting: string = 'hello from constructor';
}

describe('Object.create(prototype) — instanceof check', () => {
  it('deserialized result is instanceof the DTO class', async () => {
    const result = await deserialize(ProtoDto, { name: 'test' });
    expect(result).toBeInstanceOf(ProtoDto);
  });
});

describe('Object.create(prototype) — constructor property', () => {
  it('result has correct constructor property via prototype', async () => {
    const result = await deserialize(ProtoDto, { name: 'test' }) as ProtoDto;
    expect(result.constructor).toBe(ProtoDto);
  });
});

describe('Object.create(prototype) — exposeDefaultValues:true uses new Cls()', () => {
  class DefaultDto {
    @Field(isString, { optional: true }) tag?: string;
    fallback: string = 'default-value';
  }

  it('exposeDefaultValues:true populates class defaults', async () => {
    configure({ allowClassDefaults: true });
    const result = await deserialize(DefaultDto, {}) as DefaultDto;
    expect(result.fallback).toBe('default-value');
  });
});

describe('Object.create(prototype) — exposeDefaultValues:false skips constructor', () => {
  class SideEffectDto {
    @Field(isString, { optional: true }) tag?: string;
    sideEffect: string = 'should-not-appear';
  }

  it('exposeDefaultValues:false result does not have constructor-assigned values', async () => {
    configure({ allowClassDefaults: false });
    const result = await deserialize(SideEffectDto, {}) as any;
    expect(result.sideEffect).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. validate.ts — overload resolution edge cases
// ═════════════════════════════════════════════════════════════════════════════

class OverloadDto {
  @Field(isString) name!: string;
}

describe('validate overload — object with emit but no ruleName -> DTO mode', () => {
  it('class + object with emit property treated as DTO input', async () => {
    const input = { name: 'Alice', emit: 'some-value' };
    const result = await validate(OverloadDto, input);
    expect(result).toBe(true);
  });
});

describe('validate overload — class + EmittableRule -> ad-hoc mode', () => {
  it('function value validated against rule in ad-hoc mode', async () => {
    const fn = () => {};
    const result = await validate(fn, isString);
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors[0]!.code).toBe('isString');
    }
  });
});

describe('validate overload — non-function first arg -> ad-hoc', () => {
  it('number as first arg uses ad-hoc mode', () => {
    const result = validate(42, isNumber());
    expect(result).toBe(true);
  });

  it('string as first arg uses ad-hoc mode', () => {
    const result = validate('hello', isString);
    expect(result).toBe(true);
  });

  it('null as first arg uses ad-hoc mode', () => {
    const result = validate(null, isString);
    expect(isBakerError(result)).toBe(true);
  });
});

describe('validate overload — Class, input, options passed through', () => {
  class GroupedDto {
    @Field(isString) name!: string;
    @Field(isString, { groups: ['admin'] }) secret!: string;
  }

  it('options.groups correctly passed to _runSealed', async () => {
    const result = await validate(GroupedDto, { name: 'A', secret: 'S' }, { groups: ['admin'] });
    expect(result).toBe(true);
  });

  it('without groups option omits group-only fields', async () => {
    const result = await validate(GroupedDto, { name: 'A' });
    expect(result).toBe(true);
  });
});

describe('validate overload — validate(null) ad-hoc with no rules', () => {
  it('validate(null) with no rules returns true', () => {
    const result = validate(null);
    expect(result).toBe(true);
  });
});

describe('validate overload — validate(undefined) ad-hoc with no rules', () => {
  it('validate(undefined) with no rules returns true', () => {
    const result = validate(undefined);
    expect(result).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. validate.ts — ad-hoc async behavior
// ═════════════════════════════════════════════════════════════════════════════

const asyncTrue = createRule({
  name: 'asyncTrue',
  validate: async () => true,
});

const asyncFalse = createRule({
  name: 'asyncFalse',
  validate: async () => false,
});

const asyncAlsoFalse = createRule({
  name: 'asyncAlsoFalse',
  validate: async () => false,
});

describe('validate ad-hoc async — all async rules pass', () => {
  it('returns true', async () => {
    const result = await validate('hello', asyncTrue);
    expect(result).toBe(true);
  });
});

describe('validate ad-hoc async — all async rules fail', () => {
  it('returns BakerErrors for all', async () => {
    const result = await validate('hello', asyncFalse, asyncAlsoFalse);
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]!.code).toBe('asyncFalse');
      expect(result.errors[1]!.code).toBe('asyncAlsoFalse');
    }
  });
});

describe('validate ad-hoc async — first sync passes, async fails', () => {
  it('returns errors only for the async failure', async () => {
    const result = await validate('hello', isString, asyncFalse);
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.code).toBe('asyncFalse');
    }
  });
});

describe('validate ad-hoc async — async rule returns Promise<false>', () => {
  it('resolves to BakerErrors', async () => {
    const result = await validate(42, asyncFalse);
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors[0]!.code).toBe('asyncFalse');
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. seal.ts — analyzeAsync with resolvedClass simplification
// ═════════════════════════════════════════════════════════════════════════════

describe('analyzeAsync — DTO with nested async DTO detected as async', () => {
  class InnerAsync {
    @Field(isString, { transform: { deserialize: async ({ value }) => value, serialize: ({ value }) => value } }) val!: string;
  }

  class OuterWithAsync {
    @Field(isString) id!: string;
    @Field({ type: () => InnerAsync }) inner!: InnerAsync;
  }

  it('deserialize returns Promise (async detection correct)', async () => {
    const result = deserialize(OuterWithAsync, { id: '1', inner: { val: 'x' } });
    expect(result).toBeInstanceOf(Promise);
    const resolved = await result;
    expect(isBakerError(resolved)).toBe(false);
  });
});

describe('analyzeAsync — DTO with nested sync DTO detected as sync', () => {
  class InnerSync {
    @Field(isString) val!: string;
  }

  class OuterWithSync {
    @Field(isString) id!: string;
    @Field({ type: () => InnerSync }) inner!: InnerSync;
  }

  it('deserialize returns synchronously (not a Promise)', () => {
    const result = deserialize(OuterWithSync, { id: '1', inner: { val: 'x' } });
    expect(result).not.toBeInstanceOf(Promise);
    expect(isBakerError(result)).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. errors.ts — isBakerError edge cases
// ═════════════════════════════════════════════════════════════════════════════

describe('isBakerError — object with baker error symbol but errors is not array', () => {
  it('still detected as BakerErrors (isBakerError checks symbol only)', () => {
    const BAKER_ERR = Symbol.for('baker:error');
    const fake = { [BAKER_ERR]: true, errors: 'not-an-array' };
    expect(isBakerError(fake)).toBe(true);
  });
});

describe('isBakerError — wrong symbol (non-global)', () => {
  it('local Symbol("baker:error") is not detected', () => {
    const localSym = Symbol('baker:error');
    const fake = { [localSym]: true, errors: [] };
    expect(isBakerError(fake)).toBe(false);
  });
});

describe('isBakerError — frozen BakerErrors object', () => {
  it('frozen object is still detected', () => {
    const errors = _toBakerErrors([{ path: '', code: 'test' }]);
    const frozen = Object.freeze(errors);
    expect(isBakerError(frozen)).toBe(true);
  });
});

describe('isBakerError — two different BakerErrors objects both detected', () => {
  it('multiple distinct BakerErrors are all recognized', () => {
    const e1 = _toBakerErrors([{ path: 'a', code: 'c1' }]);
    const e2 = _toBakerErrors([{ path: 'b', code: 'c2' }]);
    expect(isBakerError(e1)).toBe(true);
    expect(isBakerError(e2)).toBe(true);
    expect(e1).not.toBe(e2);
  });
});
