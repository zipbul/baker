import { describe, it, expect, afterEach } from 'bun:test';

import type { RawPropertyMeta, TransformDef, TypeDef } from '../metadata/interfaces';
import type { EmittableRule } from '../rules/interfaces';
import type { TransformParams } from '../transformers/interfaces';

import { assertDefined } from '../../test/integration/helpers/assert';
import { applyField } from '../../test/integration/helpers/modern-decorator';
import { metaStore } from '../metadata';
import { ExcludeMode } from './enums';
import { Field } from './field';

const createdCtors: Function[] = [];

function makeClass(): new () => unknown {
  const ctor = class TestFieldMeta {};
  createdCtors.push(ctor);
  return ctor;
}

function fieldMeta(ctor: Function, key: string): RawPropertyMeta {
  const m = metaStore.require(ctor)[key];
  if (!m) {
    throw new Error(`${ctor.name}.${key} not registered`);
  }
  return m;
}

function fieldType(ctor: Function, key: string): TypeDef {
  const t = fieldMeta(ctor, key).type;
  if (!t) {
    throw new Error(`${ctor.name}.${key} has no type`);
  }
  return t;
}

function fieldTransform(ctor: Function, key: string, idx: number): TransformDef {
  const t = fieldMeta(ctor, key).transform[idx];
  if (!t) {
    throw new Error(`${ctor.name}.${key}.transform[${idx}] missing`);
  }
  return t;
}

afterEach(() => {
  for (const ctor of createdCtors) {
    metaStore.delete(ctor);
  }
  createdCtors.length = 0;
});

describe('@Field — metadata collection', () => {
  // ── expose (name / per-direction name) ──

  it('@Field({ name }) stores name in expose stack', () => {
    const Cls = makeClass();
    applyField(Field({ name: 'full_name' }), Cls, 'name');
    const expose = fieldMeta(Cls, 'name').expose;
    expect(expose[0]?.name).toBe('full_name');
  });

  it('@Field({ deserializeName, serializeName }) stacks two direction entries', () => {
    const Cls = makeClass();
    applyField(Field({ deserializeName: 'user_name', serializeName: 'userName' }), Cls, 'name');
    const expose = fieldMeta(Cls, 'name').expose;
    expect(expose).toHaveLength(2);
    expect(expose[0]).toEqual({ name: 'user_name', deserializeOnly: true });
    expect(expose[1]).toEqual({ name: 'userName', serializeOnly: true });
  });

  // ── exclude ──

  it('@Field({ exclude: true }) sets exclude to {}', () => {
    const Cls = makeClass();
    applyField(Field({ exclude: true }), Cls, 'secret');
    expect(fieldMeta(Cls, 'secret').exclude).toEqual({});
  });

  it('@Field({ exclude: "serializeOnly" }) stored correctly', () => {
    const Cls = makeClass();
    applyField(Field({ exclude: ExcludeMode.SerializeOnly }), Cls, 'field');
    expect(fieldMeta(Cls, 'field').exclude?.serializeOnly).toBe(true);
  });

  it('@Field({ exclude: "deserializeOnly" }) stored correctly', () => {
    const Cls = makeClass();
    applyField(Field({ exclude: ExcludeMode.DeserializeOnly }), Cls, 'field');
    expect(fieldMeta(Cls, 'field').exclude?.deserializeOnly).toBe(true);
  });

  // ── transform ──

  it('@Field({ transform }) stores the raw deserialize+serialize fns in transform stack', () => {
    const Cls = makeClass();
    const desFn = ({ value }: TransformParams): unknown => value;
    const serFn = ({ value }: TransformParams): unknown => value;
    applyField(Field({ transform: { deserialize: desFn, serialize: serFn } }), Cls, 'name');
    expect(fieldMeta(Cls, 'name').transform).toHaveLength(2);
    const d = fieldTransform(Cls, 'name', 0);
    const s = fieldTransform(Cls, 'name', 1);
    // The stored fn is the raw user function — no wrapping closure (the Promise-return guard is
    // inlined into generated codegen instead, gated on the isAsync flag computed here).
    expect(d.fn).toBe(desFn);
    expect(d.isAsync).toBe(false);
    expect(d.options?.deserializeOnly).toBe(true);
    expect(s.fn).toBe(serFn);
    expect(s.isAsync).toBe(false);
    expect(s.options?.serializeOnly).toBe(true);
  });

  // ── type ──

  it('@Field({ type }) stores fn in meta.type', () => {
    const Cls = makeClass();
    class NestedDto {}
    applyField(Field({ type: () => NestedDto }), Cls, 'child');
    expect(fieldType(Cls, 'child').fn()).toBe(NestedDto);
  });

  it('@Field({ type, discriminator }) stores discriminator config', () => {
    const Cls = makeClass();
    class DogDto {}
    class CatDto {}
    applyField(
      Field({
        type: () => DogDto,
        discriminator: {
          property: 'breed',
          subTypes: [
            { value: DogDto, name: 'dog' },
            { value: CatDto, name: 'cat' },
          ],
        },
      }),
      Cls,
      'animal',
    );
    const disc = fieldType(Cls, 'animal').discriminator;
    assertDefined(disc);
    expect(disc.property).toBe('breed');
    expect(disc.subTypes).toHaveLength(2);
  });

  it('@Field({ type, discriminator, keepDiscriminatorProperty }) stores flag', () => {
    const Cls = makeClass();
    class DogDto {}
    applyField(
      Field({
        type: () => DogDto,
        discriminator: { property: 'kind', subTypes: [{ value: DogDto, name: 'dog' }] },
        keepDiscriminatorProperty: true,
      }),
      Cls,
      'pet',
    );
    expect(fieldType(Cls, 'pet').keepDiscriminatorProperty).toBe(true);
  });

  // ── groups ──

  it('@Field(rule, { groups }) attaches groups to validation', () => {
    const Cls = makeClass();
    const rule: EmittableRule = Object.assign((v: unknown): boolean => typeof v === 'string', {
      ruleName: 'isString',
      emit: (): string => '',
    });
    applyField(Field(rule, { groups: ['admin'] }), Cls, 'field');
    const rd = fieldMeta(Cls, 'field').validation[0];
    expect(rd?.groups).toEqual(['admin']);
  });

  // ── flags ──

  it('@Field({ optional }) sets isOptional flag', () => {
    const Cls = makeClass();
    applyField(Field({ optional: true }), Cls, 'field');
    expect(fieldMeta(Cls, 'field').flags.isOptional).toBe(true);
  });

  it('@Field({ nullable }) sets isNullable flag', () => {
    const Cls = makeClass();
    applyField(Field({ nullable: true }), Cls, 'field');
    expect(fieldMeta(Cls, 'field').flags.isNullable).toBe(true);
  });

  it('@Field({ when }) sets validateIf flag', () => {
    const Cls = makeClass();
    const cond = (obj: Record<string, unknown>) => obj['active'] === true;
    applyField(Field({ when: cond }), Cls, 'field');
    expect(fieldMeta(Cls, 'field').flags.validateIf).toBe(cond);
  });
});
