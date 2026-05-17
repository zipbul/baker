import { describe, it, expect, afterEach } from 'bun:test';

import type { EmittableRule, RawPropertyMeta, TransformDef, TransformParams, TypeDef } from '../types';

import { deleteRaw, requireRaw } from '../meta-access';
import { globalRegistry } from '../registry';
import { Field } from './field';

const createdCtors: Function[] = [];

function makeClass(): new () => unknown {
  const ctor = class TestFieldMeta {};
  createdCtors.push(ctor);
  return ctor;
}

function fieldMeta(ctor: Function, key: string): RawPropertyMeta {
  const m = requireRaw(ctor)[key];
  if (!m) {throw new Error(`${ctor.name}.${key} not registered`);}
  return m;
}

function fieldType(ctor: Function, key: string): TypeDef {
  const t = fieldMeta(ctor, key).type;
  if (!t) {throw new Error(`${ctor.name}.${key} has no type`);}
  return t;
}

function fieldTransform(ctor: Function, key: string, idx: number): TransformDef {
  const t = fieldMeta(ctor, key).transform[idx];
  if (!t) {throw new Error(`${ctor.name}.${key}.transform[${idx}] missing`);}
  return t;
}

afterEach(() => {
  for (const ctor of createdCtors) {
    globalRegistry.delete(ctor);
    deleteRaw(ctor);
  }
  createdCtors.length = 0;
});

describe('@Field — metadata collection', () => {
  // ── expose (name / per-direction name) ──

  it('@Field({ name }) stores name in expose stack', () => {
    const Cls = makeClass();
    Field({ name: 'full_name' })(Cls.prototype, 'name');
    const expose = fieldMeta(Cls, 'name').expose;
    expect(expose[0]?.name).toBe('full_name');
  });

  it('@Field({ deserializeName, serializeName }) stacks two direction entries', () => {
    const Cls = makeClass();
    Field({ deserializeName: 'user_name', serializeName: 'userName' })(Cls.prototype, 'name');
    const expose = fieldMeta(Cls, 'name').expose;
    expect(expose).toHaveLength(2);
    expect(expose[0]).toEqual({ name: 'user_name', deserializeOnly: true });
    expect(expose[1]).toEqual({ name: 'userName', serializeOnly: true });
  });

  // ── exclude ──

  it('@Field({ exclude: true }) sets exclude to {}', () => {
    const Cls = makeClass();
    Field({ exclude: true })(Cls.prototype, 'secret');
    expect(fieldMeta(Cls, 'secret').exclude).toEqual({});
  });

  it('@Field({ exclude: "serializeOnly" }) stored correctly', () => {
    const Cls = makeClass();
    Field({ exclude: 'serializeOnly' })(Cls.prototype, 'field');
    expect(fieldMeta(Cls, 'field').exclude?.serializeOnly).toBe(true);
  });

  it('@Field({ exclude: "deserializeOnly" }) stored correctly', () => {
    const Cls = makeClass();
    Field({ exclude: 'deserializeOnly' })(Cls.prototype, 'field');
    expect(fieldMeta(Cls, 'field').exclude?.deserializeOnly).toBe(true);
  });

  // ── transform ──

  it('@Field({ transform }) stores deserialize+serialize fns in transform stack', () => {
    const Cls = makeClass();
    const desFn = ({ value }: TransformParams): unknown => value;
    const serFn = ({ value }: TransformParams): unknown => value;
    Field({ transform: { deserialize: desFn, serialize: serFn } })(Cls.prototype, 'name');
    expect(fieldMeta(Cls, 'name').transform).toHaveLength(2);
    const d = fieldTransform(Cls, 'name', 0);
    const s = fieldTransform(Cls, 'name', 1);
    expect(d.fn).not.toBe(desFn);
    expect(d.options?.deserializeOnly).toBe(true);
    expect(d.fn({ value: 'x', key: 'name', obj: {} })).toBe('x');
    expect(s.fn).not.toBe(serFn);
    expect(s.options?.serializeOnly).toBe(true);
    expect(s.fn({ value: 'y', key: 'name', obj: {} })).toBe('y');
  });

  // ── type ──

  it('@Field({ type }) stores fn in meta.type', () => {
    const Cls = makeClass();
    class NestedDto {}
    Field({ type: () => NestedDto })(Cls.prototype, 'child');
    expect(fieldType(Cls, 'child').fn()).toBe(NestedDto);
  });

  it('@Field({ type, discriminator }) stores discriminator config', () => {
    const Cls = makeClass();
    class DogDto {}
    class CatDto {}
    Field({
      type: () => DogDto,
      discriminator: {
        property: 'breed',
        subTypes: [
          { value: DogDto, name: 'dog' },
          { value: CatDto, name: 'cat' },
        ],
      },
    })(Cls.prototype, 'animal');
    const disc = fieldType(Cls, 'animal').discriminator;
    if (!disc) {throw new Error('discriminator missing');}
    expect(disc.property).toBe('breed');
    expect(disc.subTypes).toHaveLength(2);
  });

  it('@Field({ type, discriminator, keepDiscriminatorProperty }) stores flag', () => {
    const Cls = makeClass();
    class DogDto {}
    Field({
      type: () => DogDto,
      discriminator: { property: 'kind', subTypes: [{ value: DogDto, name: 'dog' }] },
      keepDiscriminatorProperty: true,
    })(Cls.prototype, 'pet');
    expect(fieldType(Cls, 'pet').keepDiscriminatorProperty).toBe(true);
  });

  // ── groups ──

  it('@Field(rule, { groups }) attaches groups to validation', () => {
    const Cls = makeClass();
    const rule = Object.assign((v: unknown) => typeof v === 'string', {
      ruleName: 'isString',
      emit: () => '',
    }) as unknown as EmittableRule;
    Field(rule, { groups: ['admin'] })(Cls.prototype, 'field');
    const rd = fieldMeta(Cls, 'field').validation[0];
    expect(rd?.groups).toEqual(['admin']);
  });

  // ── flags ──

  it('@Field({ optional }) sets isOptional flag', () => {
    const Cls = makeClass();
    Field({ optional: true })(Cls.prototype, 'field');
    expect(fieldMeta(Cls, 'field').flags.isOptional).toBe(true);
  });

  it('@Field({ nullable }) sets isNullable flag', () => {
    const Cls = makeClass();
    Field({ nullable: true })(Cls.prototype, 'field');
    expect(fieldMeta(Cls, 'field').flags.isNullable).toBe(true);
  });

  it('@Field({ when }) sets validateIf flag', () => {
    const Cls = makeClass();
    const cond = (obj: Record<string, unknown>) => obj['active'] === true;
    Field({ when: cond })(Cls.prototype, 'field');
    expect(fieldMeta(Cls, 'field').flags.validateIf).toBe(cond);
  });
});
