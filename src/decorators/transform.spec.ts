import { describe, it, expect, afterEach } from 'bun:test';
import { globalRegistry } from '../registry';
import { Field } from './field';

const RAW = Symbol.for('baker:raw');
const createdCtors: Function[] = [];

function makeClass(): new () => any {
  const ctor = class TestFieldMeta {};
  createdCtors.push(ctor);
  return ctor as any;
}

function getRaw(ctor: Function, key: string): any {
  return (ctor as any)[RAW]?.[key];
}

afterEach(() => {
  for (const ctor of createdCtors) {
    globalRegistry.delete(ctor);
    delete (ctor as any)[RAW];
  }
  createdCtors.length = 0;
});

describe('@Field — metadata collection', () => {
  // ── expose (name / per-direction name) ──

  it('@Field({ name }) stores name in expose stack', () => {
    const Cls = makeClass();
    Field({ name: 'full_name' })(Cls.prototype, 'name');
    expect(getRaw(Cls, 'name').expose[0].name).toBe('full_name');
  });

  it('@Field({ deserializeName, serializeName }) stacks two direction entries', () => {
    const Cls = makeClass();
    Field({ deserializeName: 'user_name', serializeName: 'userName' })(Cls.prototype, 'name');
    const expose = getRaw(Cls, 'name').expose;
    expect(expose).toHaveLength(2);
    expect(expose[0]).toEqual({ name: 'user_name', deserializeOnly: true });
    expect(expose[1]).toEqual({ name: 'userName', serializeOnly: true });
  });

  // ── exclude ──

  it('@Field({ exclude: true }) sets exclude to {}', () => {
    const Cls = makeClass();
    Field({ exclude: true })(Cls.prototype, 'secret');
    expect(getRaw(Cls, 'secret').exclude).toEqual({});
  });

  it('@Field({ exclude: "serializeOnly" }) stored correctly', () => {
    const Cls = makeClass();
    Field({ exclude: 'serializeOnly' })(Cls.prototype, 'field');
    expect(getRaw(Cls, 'field').exclude?.serializeOnly).toBe(true);
  });

  it('@Field({ exclude: "deserializeOnly" }) stored correctly', () => {
    const Cls = makeClass();
    Field({ exclude: 'deserializeOnly' })(Cls.prototype, 'field');
    expect(getRaw(Cls, 'field').exclude?.deserializeOnly).toBe(true);
  });

  // ── transform ──

  it('@Field({ transform }) stores deserialize+serialize fns in transform stack', () => {
    const Cls = makeClass();
    const desFn = ({ value }: any) => value;
    const serFn = ({ value }: any) => value;
    Field({ transform: { deserialize: desFn, serialize: serFn } })(Cls.prototype, 'name');
    expect(getRaw(Cls, 'name').transform).toHaveLength(2);
    expect(getRaw(Cls, 'name').transform[0].fn).not.toBe(desFn);
    expect(getRaw(Cls, 'name').transform[0].options?.deserializeOnly).toBe(true);
    expect(getRaw(Cls, 'name').transform[0].fn({ value: 'x', key: 'name', obj: {} })).toBe('x');
    expect(getRaw(Cls, 'name').transform[1].fn).not.toBe(serFn);
    expect(getRaw(Cls, 'name').transform[1].options?.serializeOnly).toBe(true);
    expect(getRaw(Cls, 'name').transform[1].fn({ value: 'y', key: 'name', obj: {} })).toBe('y');
  });

  // ── type ──

  it('@Field({ type }) stores fn in meta.type', () => {
    const Cls = makeClass();
    class NestedDto {}
    Field({ type: () => NestedDto })(Cls.prototype, 'child');
    expect(getRaw(Cls, 'child').type).not.toBeNull();
    expect(getRaw(Cls, 'child').type.fn()).toBe(NestedDto);
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
    const typeDef = getRaw(Cls, 'animal').type;
    expect(typeDef.discriminator.property).toBe('breed');
    expect(typeDef.discriminator.subTypes).toHaveLength(2);
  });

  it('@Field({ type, discriminator, keepDiscriminatorProperty }) stores flag', () => {
    const Cls = makeClass();
    class DogDto {}
    Field({
      type: () => DogDto,
      discriminator: { property: 'kind', subTypes: [{ value: DogDto, name: 'dog' }] },
      keepDiscriminatorProperty: true,
    })(Cls.prototype, 'pet');
    expect(getRaw(Cls, 'pet').type.keepDiscriminatorProperty).toBe(true);
  });

  // ── groups ──

  it('@Field(rule, { groups }) attaches groups to validation', () => {
    const Cls = makeClass();
    const rule = Object.assign((v: any) => typeof v === 'string', { ruleName: 'isString', emit: () => '' });
    Field(rule, { groups: ['admin'] })(Cls.prototype, 'field');
    expect(getRaw(Cls, 'field').validation[0].groups).toEqual(['admin']);
  });

  // ── flags ──

  it('@Field({ optional }) sets isOptional flag', () => {
    const Cls = makeClass();
    Field({ optional: true })(Cls.prototype, 'field');
    expect(getRaw(Cls, 'field').flags.isOptional).toBe(true);
  });

  it('@Field({ nullable }) sets isNullable flag', () => {
    const Cls = makeClass();
    Field({ nullable: true })(Cls.prototype, 'field');
    expect(getRaw(Cls, 'field').flags.isNullable).toBe(true);
  });

  it('@Field({ when }) sets validateIf flag', () => {
    const Cls = makeClass();
    const cond = (obj: any) => obj.active;
    Field({ when: cond })(Cls.prototype, 'field');
    expect(getRaw(Cls, 'field').flags.validateIf).toBe(cond);
  });
});
