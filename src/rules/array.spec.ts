import { describe, it, expect, mock } from 'bun:test';

import type { EmitContext } from './types';

import { arrayContains, arrayNotContains, arrayMinSize, arrayMaxSize, arrayUnique, arrayNotEmpty } from './array';

function makeCtx(refIndex: number = 0) {
  const addRefMock = mock((_fn: Function) => refIndex++);
  const addRegexMock = mock((_re: RegExp) => refIndex++);
  const failMock = mock((code: string) => `throw new Error('${code}')`);
  const ctx: EmitContext = {
    addRegex: addRegexMock,
    addRef: addRefMock,
    addExecutor: mock(() => 0),
    fail: failMock,
    collectErrors: false,
  };
  return { ctx, addRefMock, addRegexMock, failMock };
}

// ─── arrayContains ────────────────────────────────────────────────────────────

describe('arrayContains', () => {
  it('should return true when array contains all required values', () => {
    expect(arrayContains(['a', 'b'])(['a', 'b', 'c'])).toBe(true);
  });

  it('should return true when required list is empty', () => {
    expect(arrayContains([])(['x', 'y'])).toBe(true);
  });

  it('should return false when a required value is missing', () => {
    expect(arrayContains(['a', 'b'])(['a', 'c'])).toBe(false);
  });

  it('should return false for non-array input', () => {
    expect(arrayContains(['a'])('not-an-array')).toBe(false);
    expect(arrayContains(['a'])(null)).toBe(false);
    expect(arrayContains(['a'])(42)).toBe(false);
  });

  it('should call ctx.addRef and generate includes check code when calling emit()', () => {
    const { ctx, addRefMock, failMock } = makeCtx(0);
    const code = arrayContains(['a', 'b']).emit('v', ctx);
    expect(addRefMock).toHaveBeenCalledTimes(1);
    expect(code).toBeTruthy();
    expect(failMock).toHaveBeenCalledWith('arrayContains');
    expect(arrayContains(['a']).ruleName).toBe('arrayContains');
  });
});

// ─── arrayNotContains ────────────────────────────────────────────────────────

describe('arrayNotContains', () => {
  it('should return true when array does not contain any forbidden value', () => {
    expect(arrayNotContains(['x', 'y'])(['a', 'b', 'c'])).toBe(true);
  });

  it('should return true for empty array', () => {
    expect(arrayNotContains(['x'])([])).toBe(true);
  });

  it('should return false when array contains a forbidden value', () => {
    expect(arrayNotContains(['x'])(['a', 'x', 'b'])).toBe(false);
  });

  it('should return false for non-array input', () => {
    expect(arrayNotContains(['x'])('string')).toBe(false);
    expect(arrayNotContains(['x'])(null)).toBe(false);
  });

  it('should call ctx.addRef and generate inverse includes check code when calling emit()', () => {
    const { ctx, addRefMock, failMock } = makeCtx(0);
    const code = arrayNotContains(['x']).emit('v', ctx);
    expect(addRefMock).toHaveBeenCalledTimes(1);
    expect(code).toBeTruthy();
    expect(failMock).toHaveBeenCalledWith('arrayNotContains');
    expect(arrayNotContains(['x']).ruleName).toBe('arrayNotContains');
  });
});

// ─── arrayMinSize ─────────────────────────────────────────────────────────────

describe('arrayMinSize', () => {
  it('should return true when array length equals minimum', () => {
    expect(arrayMinSize(3)(['a', 'b', 'c'])).toBe(true);
  });

  it('should return true when array length exceeds minimum', () => {
    expect(arrayMinSize(2)(['a', 'b', 'c'])).toBe(true);
  });

  it('should return true for empty array when minimum is 0', () => {
    expect(arrayMinSize(0)([])).toBe(true);
  });

  it('should return false when array length is below minimum', () => {
    expect(arrayMinSize(3)(['a', 'b'])).toBe(false);
  });

  it('should return false for non-array input', () => {
    expect(arrayMinSize(1)('hello')).toBe(false);
    expect(arrayMinSize(1)(null)).toBe(false);
  });

  it('should generate length >= n check code when calling emit() and have ruleName arrayMinSize', () => {
    const { ctx, failMock } = makeCtx(0);
    const code = arrayMinSize(3).emit('v', ctx);
    expect(code).toContain('v.length');
    expect(code).toContain('3');
    expect(failMock).toHaveBeenCalledWith('arrayMinSize');
    expect(arrayMinSize(3).ruleName).toBe('arrayMinSize');
  });
});

// ─── arrayMaxSize ─────────────────────────────────────────────────────────────

describe('arrayMaxSize', () => {
  it('should return true when array length equals maximum', () => {
    expect(arrayMaxSize(3)(['a', 'b', 'c'])).toBe(true);
  });

  it('should return true when array length is below maximum', () => {
    expect(arrayMaxSize(5)(['a', 'b'])).toBe(true);
  });

  it('should return true for empty array when maximum is 0', () => {
    expect(arrayMaxSize(0)([])).toBe(true);
  });

  it('should return false when array length exceeds maximum', () => {
    expect(arrayMaxSize(2)(['a', 'b', 'c'])).toBe(false);
  });

  it('should return false for non-array input', () => {
    expect(arrayMaxSize(5)('hello')).toBe(false);
    expect(arrayMaxSize(5)(null)).toBe(false);
  });

  it('should generate length > n check code when calling emit() and have ruleName arrayMaxSize', () => {
    const { ctx, failMock } = makeCtx(0);
    const code = arrayMaxSize(3).emit('v', ctx);
    expect(code).toContain('v.length');
    expect(code).toContain('3');
    expect(failMock).toHaveBeenCalledWith('arrayMaxSize');
    expect(arrayMaxSize(3).ruleName).toBe('arrayMaxSize');
  });
});

// ─── arrayUnique ──────────────────────────────────────────────────────────────

describe('arrayUnique', () => {
  it('should return true when all elements are unique', () => {
    expect(arrayUnique()(['a', 'b', 'c'])).toBe(true);
  });

  it('should return true for empty array', () => {
    expect(arrayUnique()([])).toBe(true);
  });

  it('should return true for single element', () => {
    expect(arrayUnique()([42])).toBe(true);
  });

  it('should return false when duplicate values exist', () => {
    expect(arrayUnique()(['a', 'b', 'a'])).toBe(false);
  });

  it('should return false for non-array input', () => {
    expect(arrayUnique()('hello')).toBe(false);
    expect(arrayUnique()(null)).toBe(false);
  });

  it('should use identifier function to determine uniqueness when provided', () => {
    const byId = (v: unknown) => (v as { id: number }).id;
    expect(arrayUnique(byId)([{ id: 1 }, { id: 2 }])).toBe(true);
    expect(arrayUnique(byId)([{ id: 1 }, { id: 1 }])).toBe(false);
  });

  it('should generate code and have ruleName arrayUnique when calling emit()', () => {
    const { ctx, failMock } = makeCtx(0);
    const code = arrayUnique().emit('v', ctx);
    expect(code).toBeTruthy();
    expect(failMock).toHaveBeenCalledWith('arrayUnique');
    expect(arrayUnique().ruleName).toBe('arrayUnique');
  });

  it('should generate identifier-map code when emit() is called with an identifier function', () => {
    const { ctx, addRefMock, failMock } = makeCtx(0);
    const byId = (v: unknown) => (v as { id: number }).id;
    const code = arrayUnique(byId).emit('v', ctx);
    expect(addRefMock).toHaveBeenCalledWith(byId);
    expect(code).toContain('v.map(');
    expect(code).toContain('Set');
    expect(failMock).toHaveBeenCalledWith('arrayUnique');
  });
});

// ─── arrayNotEmpty ────────────────────────────────────────────────────────────

describe('arrayNotEmpty', () => {
  it('should return true when array has at least one element', () => {
    expect(arrayNotEmpty(['x', 'y'])).toBe(true);
  });

  it('should return false for empty array', () => {
    expect(arrayNotEmpty([])).toBe(false);
  });

  it('should return false for non-array input', () => {
    expect(arrayNotEmpty('hello')).toBe(false);
    expect(arrayNotEmpty(null)).toBe(false);
  });

  it('should generate length > 0 check code when calling emit() and have ruleName arrayNotEmpty', () => {
    const { ctx, failMock } = makeCtx(0);
    const code = arrayNotEmpty.emit('v', ctx);
    expect(code).toContain('v.length === 0');
    expect(failMock).toHaveBeenCalledWith('arrayNotEmpty');
    expect(arrayNotEmpty.ruleName).toBe('arrayNotEmpty');
  });
});
