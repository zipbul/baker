import { describe, it, expect, afterEach } from 'bun:test';
import { RAW, RAW_CLASS_SCHEMA } from '../symbols';
import { globalRegistry } from '../registry';
import { ensureMeta, collectSchema, collectClassSchema } from '../collect';
import { toJsonSchema } from './to-json-schema';
import type { JsonSchema202012 } from '../types';

// 테스트에서 사용한 모든 클래스를 추적하여 afterEach에서 정리
const trackedClasses: Function[] = [];

function makeClass(name = 'TestDto'): new (...args: any[]) => any {
  const ctor = class {} as any;
  Object.defineProperty(ctor, 'name', { value: name });
  trackedClasses.push(ctor);
  globalRegistry.add(ctor);
  return ctor;
}

/** 룰을 RuleDef에 맞게 생성하는 헬퍼 */
function fakeRule(ruleName: string, constraints: Record<string, unknown> = {}, each = false) {
  const fn = () => true;
  (fn as any).ruleName = ruleName;
  (fn as any).constraints = constraints;
  (fn as any).emit = () => '';
  return { rule: fn as any, each };
}

afterEach(() => {
  for (const cls of trackedClasses) {
    globalRegistry.delete(cls);
    delete (cls as any)[RAW];
    delete (cls as any)[RAW_CLASS_SCHEMA];
  }
  trackedClasses.length = 0;
});

// ─────────────────────────────────────────────────────────────────────────────
// 기본 구조
// ─────────────────────────────────────────────────────────────────────────────

describe('toJsonSchema — 기본 구조', () => {
  it('빈 DTO → { type: "object", properties: {} }', () => {
    const Dto = makeClass('EmptyDto');
    // ensureMeta를 호출하지 않아도 mergeInheritance가 빈 객체 반환
    const schema = toJsonSchema(Dto);
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.type).toBe('object');
    expect(schema.properties).toEqual({});
    expect(schema.required).toBeUndefined();
  });

  it('단일 문자열 필드', () => {
    const Dto = makeClass('StringDto');
    const meta = ensureMeta(Dto, 'name');
    meta.validation.push(fakeRule('isString'));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.name).toEqual({ type: 'string' });
    expect(schema.required).toEqual(['name']);
  });

  it('다중 필드 + required 결정', () => {
    const Dto = makeClass('MultiDto');
    const meta1 = ensureMeta(Dto, 'name');
    meta1.validation.push(fakeRule('isString'));

    const meta2 = ensureMeta(Dto, 'age');
    meta2.validation.push(fakeRule('isNumber'));

    const meta3 = ensureMeta(Dto, 'nickname');
    meta3.validation.push(fakeRule('isString'));
    meta3.flags.isOptional = true;

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.name).toEqual({ type: 'string' });
    expect(schema.properties!.age).toEqual({ type: 'number' });
    expect(schema.required).toContain('name');
    expect(schema.required).toContain('age');
    expect(schema.required).not.toContain('nickname');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 타입 매핑
// ─────────────────────────────────────────────────────────────────────────────

describe('toJsonSchema — 타입 매핑', () => {
  it.each([
    ['isString', {}, { type: 'string' }],
    ['isNumber', {}, { type: 'number' }],
    ['isInt', {}, { type: 'integer' }],
    ['isBoolean', {}, { type: 'boolean' }],
    ['isDate', {}, { type: 'string', format: 'date-time' }],
    ['isArray', {}, { type: 'array' }],
    ['isObject', {}, { type: 'object' }],
  ] as const)('%s → %o', (ruleName, constraints, expected) => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'field');
    meta.validation.push(fakeRule(ruleName, constraints));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.field).toEqual(expected);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// enum / const
// ─────────────────────────────────────────────────────────────────────────────

describe('toJsonSchema — enum / const', () => {
  it('isEnum → enum', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'role');
    meta.validation.push(fakeRule('isEnum', { values: ['admin', 'user'] }));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.role).toEqual({ enum: ['admin', 'user'] });
  });

  it('isIn → enum', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'status');
    meta.validation.push(fakeRule('isIn', { values: ['active', 'inactive'] }));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.status).toEqual({ enum: ['active', 'inactive'] });
  });

  it('equals → const', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'type');
    meta.validation.push(fakeRule('equals', { value: 'fixed' }));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.type).toEqual({ const: 'fixed' });
  });

  it('notEquals → not.const', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'val');
    meta.validation.push(fakeRule('notEquals', { value: 'bad' }));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.val).toEqual({ not: { const: 'bad' } });
  });

  it('isNotIn → not.enum', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'val');
    meta.validation.push(fakeRule('isNotIn', { values: [1, 2, 3] }));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.val).toEqual({ not: { enum: [1, 2, 3] } });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 숫자 제약
// ─────────────────────────────────────────────────────────────────────────────

describe('toJsonSchema — 숫자', () => {
  it('min/max (inclusive)', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'age');
    meta.validation.push(fakeRule('isNumber'));
    meta.validation.push(fakeRule('min', { min: 0 }));
    meta.validation.push(fakeRule('max', { max: 150 }));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.age).toEqual({
      type: 'number', minimum: 0, maximum: 150,
    });
  });

  it('min/max (exclusive)', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'score');
    meta.validation.push(fakeRule('min', { min: 0, exclusive: true }));
    meta.validation.push(fakeRule('max', { max: 100, exclusive: true }));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.score).toEqual({
      exclusiveMinimum: 0, exclusiveMaximum: 100,
    });
  });

  it('isPositive / isNegative', () => {
    const Dto = makeClass();
    const posM = ensureMeta(Dto, 'pos');
    posM.validation.push(fakeRule('isPositive'));
    const negM = ensureMeta(Dto, 'neg');
    negM.validation.push(fakeRule('isNegative'));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.pos).toEqual({ exclusiveMinimum: 0 });
    expect(schema.properties!.neg).toEqual({ exclusiveMaximum: 0 });
  });

  it('isDivisibleBy → multipleOf', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'val');
    meta.validation.push(fakeRule('isDivisibleBy', { divisor: 5 }));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.val).toEqual({ multipleOf: 5 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 문자열 제약
// ─────────────────────────────────────────────────────────────────────────────

describe('toJsonSchema — 문자열', () => {
  it('minLength / maxLength', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'name');
    meta.validation.push(fakeRule('isString'));
    meta.validation.push(fakeRule('minLength', { min: 1 }));
    meta.validation.push(fakeRule('maxLength', { max: 50 }));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.name).toEqual({
      type: 'string', minLength: 1, maxLength: 50,
    });
  });

  it('length → minLength + maxLength', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'code');
    meta.validation.push(fakeRule('length', { min: 3, max: 10 }));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.code).toEqual({ minLength: 3, maxLength: 10 });
  });

  it('matches → pattern', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'slug');
    meta.validation.push(fakeRule('matches', { pattern: '^[a-z-]+$' }));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.slug).toEqual({ pattern: '^[a-z-]+$' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// format 매핑
// ─────────────────────────────────────────────────────────────────────────────

describe('toJsonSchema — format', () => {
  it.each([
    ['isEmail', {}, 'email'],
    ['isURL', {}, 'uri'],
    ['isUUID', {}, 'uuid'],
    ['isISO8601', {}, 'date-time'],
    ['isIP', { version: 4 }, 'ipv4'],
    ['isIP', { version: 6 }, 'ipv6'],
  ] as const)('%s → format: %s', (ruleName, constraints, expectedFormat) => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'field');
    meta.validation.push(fakeRule('isString'));
    meta.validation.push(fakeRule(ruleName, constraints));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.field!.format).toBe(expectedFormat);
  });

  it('isIP (버전 미지정) → 스키마 매핑 없음', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'ip');
    meta.validation.push(fakeRule('isString'));
    meta.validation.push(fakeRule('isIP', {}));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.ip).toEqual({ type: 'string' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 배열 제약
// ─────────────────────────────────────────────────────────────────────────────

describe('toJsonSchema — 배열', () => {
  it('arrayMinSize / arrayMaxSize / arrayUnique', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'tags');
    meta.validation.push(fakeRule('isArray'));
    meta.validation.push(fakeRule('arrayMinSize', { min: 1 }));
    meta.validation.push(fakeRule('arrayMaxSize', { max: 10 }));
    meta.validation.push(fakeRule('arrayUnique'));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.tags).toEqual({
      type: 'array', minItems: 1, maxItems: 10, uniqueItems: true,
    });
  });

  it('arrayNotEmpty → minItems: 1', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'items');
    meta.validation.push(fakeRule('arrayNotEmpty'));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.items).toEqual({ minItems: 1 });
  });

  it('arrayContains → contains.enum', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'arr');
    meta.validation.push(fakeRule('arrayContains', { values: ['a', 'b'] }));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.arr).toEqual({
      contains: { enum: ['a', 'b'] },
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 객체 제약
// ─────────────────────────────────────────────────────────────────────────────

describe('toJsonSchema — 객체', () => {
  it('isNotEmptyObject → minProperties: 1', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'obj');
    meta.validation.push(fakeRule('isNotEmptyObject'));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.obj).toEqual({ minProperties: 1 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// @IsOptional / @IsDefined / @IsNullable
// ─────────────────────────────────────────────────────────────────────────────

describe('toJsonSchema — 플래그', () => {
  it('@IsOptional → required 배열에서 제외', () => {
    const Dto = makeClass();
    const m1 = ensureMeta(Dto, 'required');
    m1.validation.push(fakeRule('isString'));
    const m2 = ensureMeta(Dto, 'optional');
    m2.validation.push(fakeRule('isString'));
    m2.flags.isOptional = true;

    const schema = toJsonSchema(Dto);
    expect(schema.required).toEqual(['required']);
  });

  it('@IsNullable → type 배열에 "null" 추가', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'field');
    meta.validation.push(fakeRule('isString'));
    meta.flags.isNullable = true;

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.field).toEqual({
      type: ['string', 'null'],
    });
  });

  it('@IsNullable (type 미지정) → type: ["null"]', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'field');
    meta.flags.isNullable = true;

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.field).toEqual({ type: ['null'] });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// each:true → items 서브스키마 (§6.10)
// ─────────────────────────────────────────────────────────────────────────────

describe('toJsonSchema — each:true', () => {
  it('each 룰 → items에 매핑', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'emails');
    meta.validation.push(fakeRule('isArray'));
    meta.validation.push(fakeRule('arrayMinSize', { min: 1 }));
    meta.validation.push(fakeRule('isString', {}, true));
    meta.validation.push(fakeRule('isEmail', {}, true));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.emails).toEqual({
      type: 'array',
      minItems: 1,
      items: { type: 'string', format: 'email' },
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// @Exclude 방향 인식 (§6.9)
// ─────────────────────────────────────────────────────────────────────────────

describe('toJsonSchema — @Exclude', () => {
  it('@Exclude() → 양방향 제외', () => {
    const Dto = makeClass();
    const m1 = ensureMeta(Dto, 'visible');
    m1.validation.push(fakeRule('isString'));
    const m2 = ensureMeta(Dto, 'hidden');
    m2.validation.push(fakeRule('isString'));
    m2.exclude = {};

    const deser = toJsonSchema(Dto, { direction: 'deserialize' });
    const ser = toJsonSchema(Dto, { direction: 'serialize' });
    expect(deser.properties!.hidden).toBeUndefined();
    expect(ser.properties!.hidden).toBeUndefined();
  });

  it('@Exclude({ deserializeOnly: true }) → serialize에서 포함', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'secret');
    meta.validation.push(fakeRule('isString'));
    meta.exclude = { deserializeOnly: true };

    const deser = toJsonSchema(Dto, { direction: 'deserialize' });
    const ser = toJsonSchema(Dto, { direction: 'serialize' });
    expect(deser.properties!.secret).toBeUndefined();
    expect(ser.properties!.secret).toEqual({ type: 'string' });
  });

  it('@Exclude({ serializeOnly: true }) → deserialize에서 포함', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'password');
    meta.validation.push(fakeRule('isString'));
    meta.exclude = { serializeOnly: true };

    const deser = toJsonSchema(Dto, { direction: 'deserialize' });
    const ser = toJsonSchema(Dto, { direction: 'serialize' });
    expect(deser.properties!.password).toEqual({ type: 'string' });
    expect(ser.properties!.password).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// @Expose name / direction (§6.9)
// ─────────────────────────────────────────────────────────────────────────────

describe('toJsonSchema — @Expose', () => {
  it('@Expose({ name }) → 스키마 키 변경', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'userName');
    meta.validation.push(fakeRule('isString'));
    meta.expose.push({ name: 'user_name' });

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.user_name).toEqual({ type: 'string' });
    expect(schema.properties!.userName).toBeUndefined();
    expect(schema.required).toEqual(['user_name']);
  });

  it('@Expose 방향별 name 매핑', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'firstName');
    meta.validation.push(fakeRule('isString'));
    meta.expose.push({ name: 'first_name', deserializeOnly: true });
    meta.expose.push({ name: 'firstName', serializeOnly: true });

    const deser = toJsonSchema(Dto, { direction: 'deserialize' });
    const ser = toJsonSchema(Dto, { direction: 'serialize' });
    expect(deser.properties!.first_name).toEqual({ type: 'string' });
    expect(ser.properties!.firstName).toEqual({ type: 'string' });
  });

  it('@Expose({ groups }) → groups 필터링', () => {
    const Dto = makeClass();
    const m1 = ensureMeta(Dto, 'public');
    m1.validation.push(fakeRule('isString'));
    // no groups → always included

    const m2 = ensureMeta(Dto, 'admin');
    m2.validation.push(fakeRule('isString'));
    m2.expose.push({ groups: ['admin'] });

    const all = toJsonSchema(Dto);
    expect(all.properties!.public).toBeDefined();
    expect(all.properties!.admin).toBeDefined();

    const admin = toJsonSchema(Dto, { groups: ['admin'] });
    expect(admin.properties!.public).toBeDefined();
    expect(admin.properties!.admin).toBeDefined();

    const user = toJsonSchema(Dto, { groups: ['user'] });
    expect(user.properties!.public).toBeDefined();
    expect(user.properties!.admin).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// @Type/@Nested → $ref (§6.3)
// ─────────────────────────────────────────────────────────────────────────────

describe('toJsonSchema — 중첩 DTO', () => {
  it('단순 @Type → $ref + $defs', () => {
    const AddressDto = makeClass('AddressDto');
    const addrMeta = ensureMeta(AddressDto, 'city');
    addrMeta.validation.push(fakeRule('isString'));

    const UserDto = makeClass('UserDto');
    const nameMeta = ensureMeta(UserDto, 'name');
    nameMeta.validation.push(fakeRule('isString'));
    const addrFieldMeta = ensureMeta(UserDto, 'address');
    addrFieldMeta.type = { fn: () => AddressDto as any };
    addrFieldMeta.flags.validateNested = true;

    const schema = toJsonSchema(UserDto);
    expect(schema.properties!.address).toEqual({ $ref: '#/$defs/AddressDto' });
    expect(schema.$defs!.AddressDto).toEqual({
      type: 'object',
      properties: { city: { type: 'string' } },
      required: ['city'],
    });
  });

  it('each:true → type: "array", items: { $ref }', () => {
    const ItemDto = makeClass('ItemDto');
    const iMeta = ensureMeta(ItemDto, 'name');
    iMeta.validation.push(fakeRule('isString'));

    const ListDto = makeClass('ListDto');
    const listMeta = ensureMeta(ListDto, 'items');
    listMeta.type = { fn: () => ItemDto as any };
    listMeta.flags.validateNestedEach = true;
    listMeta.validation.push(fakeRule('arrayMinSize', { min: 1 }));

    const schema = toJsonSchema(ListDto);
    expect(schema.properties!.items).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/ItemDto' },
      minItems: 1,
    });
  });

  it('discriminator → oneOf + const', () => {
    const DogDto = makeClass('DogDto');
    const dogBark = ensureMeta(DogDto, 'bark');
    dogBark.validation.push(fakeRule('isString'));

    const CatDto = makeClass('CatDto');
    const catMeow = ensureMeta(CatDto, 'meow');
    catMeow.validation.push(fakeRule('isString'));

    const PetDto = makeClass('PetDto');
    const petMeta = ensureMeta(PetDto, 'pet');
    petMeta.type = {
      fn: () => DogDto as any, // fn isn't used for discriminator
      discriminator: {
        property: 'type',
        subTypes: [
          { value: DogDto, name: 'dog' },
          { value: CatDto, name: 'cat' },
        ],
      },
    };
    petMeta.flags.validateNested = true;

    const schema = toJsonSchema(PetDto);
    expect(schema.properties!.pet).toEqual({
      oneOf: [
        {
          allOf: [
            { $ref: '#/$defs/DogDto' },
            { properties: { type: { const: 'dog' } }, required: ['type'] },
          ],
        },
        {
          allOf: [
            { $ref: '#/$defs/CatDto' },
            { properties: { type: { const: 'cat' } }, required: ['type'] },
          ],
        },
      ],
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 순환 참조 (§6.2)
// ─────────────────────────────────────────────────────────────────────────────

describe('toJsonSchema — 순환 참조', () => {
  it('A → B → A 순환', () => {
    const A = makeClass('A');
    const B = makeClass('B');

    const aMeta = ensureMeta(A, 'b');
    aMeta.type = { fn: () => B as any };
    aMeta.flags.validateNested = true;

    const bMeta = ensureMeta(B, 'a');
    bMeta.type = { fn: () => A as any };
    bMeta.flags.validateNested = true;

    const schema = toJsonSchema(A);

    // A는 루트에 인라인되며, 순환 때문에 $defs에도 등록
    expect(schema.type).toBe('object');
    expect(schema.properties!.b).toEqual({ $ref: '#/$defs/B' });
    expect(schema.$defs!.B!.properties!.a).toEqual({ $ref: '#/$defs/A' });
    expect(schema.$defs!.A).toBeDefined();
  });

  it('자기 참조', () => {
    const Node = makeClass('Node');
    const childMeta = ensureMeta(Node, 'child');
    childMeta.type = { fn: () => Node as any };
    childMeta.flags.validateNested = true;
    childMeta.flags.isOptional = true;

    const schema = toJsonSchema(Node);
    expect(schema.properties!.child).toEqual({ $ref: '#/$defs/Node' });
    expect(schema.$defs!.Node).toBeDefined();
  });

  it('동명 클래스 disambiguation', () => {
    const A1 = makeClass('Item');
    const A2 = makeClass('Item');
    const nameMeta1 = ensureMeta(A1, 'x');
    nameMeta1.validation.push(fakeRule('isString'));
    const nameMeta2 = ensureMeta(A2, 'y');
    nameMeta2.validation.push(fakeRule('isNumber'));

    const Root = makeClass('Root');
    const m1 = ensureMeta(Root, 'a');
    m1.type = { fn: () => A1 as any };
    m1.flags.validateNested = true;
    const m2 = ensureMeta(Root, 'b');
    m2.type = { fn: () => A2 as any };
    m2.flags.validateNested = true;

    const schema = toJsonSchema(Root);
    expect(schema.$defs!.Item).toBeDefined();
    expect(schema.$defs!.Item_2).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// @Schema — 프로퍼티 레벨 (§6.5, §6.6)
// ─────────────────────────────────────────────────────────────────────────────

describe('toJsonSchema — @Schema (프로퍼티)', () => {
  it('객체형: 자동 매핑 오버라이드', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'name');
    meta.validation.push(fakeRule('isString'));
    meta.validation.push(fakeRule('minLength', { min: 1 }));
    collectSchema(Dto.prototype, 'name', { minLength: 5, description: 'User name' });

    const schema = toJsonSchema(Dto);
    // @Schema 우선 → minLength는 5 (자동 매핑 1을 오버라이드)
    expect(schema.properties!.name).toEqual({
      type: 'string', minLength: 5, description: 'User name',
    });
  });

  it('함수형: auto 스키마 제어', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'value');
    meta.validation.push(fakeRule('isString'));
    collectSchema(Dto.prototype, 'value', (auto: Record<string, unknown>) => ({
      ...auto,
      anyOf: [{ type: 'string' }, { type: 'number' }],
    }));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.value!.anyOf).toEqual([
      { type: 'string' }, { type: 'number' },
    ]);
  });

  it('composition-aware merge: allOf 있으면 자동 매핑 억제', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'field');
    meta.validation.push(fakeRule('isString'));
    meta.validation.push(fakeRule('minLength', { min: 3 }));
    collectSchema(Dto.prototype, 'field', {
      allOf: [{ minLength: 1 }, { maxLength: 100 }],
    });

    const schema = toJsonSchema(Dto);
    // C-15: composition 키워드가 있어도 자동 매핑(type, minLength)이 base로 유지됨
    expect(schema.properties!.field).toEqual({
      type: 'string', minLength: 3,
      allOf: [{ minLength: 1 }, { maxLength: 100 }],
    });
    expect(schema.properties!.field!.type).toBe('string');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// @Schema — 클래스 레벨 (§6.8)
// ─────────────────────────────────────────────────────────────────────────────

describe('toJsonSchema — @Schema (클래스)', () => {
  it('클래스 레벨 메타데이터 루트에 병합', () => {
    const Dto = makeClass('CreateUserDto');
    const meta = ensureMeta(Dto, 'name');
    meta.validation.push(fakeRule('isString'));
    collectClassSchema(Dto, {
      title: 'CreateUserRequest',
      description: 'User creation payload',
    });

    const schema = toJsonSchema(Dto);
    expect(schema.title).toBe('CreateUserRequest');
    expect(schema.description).toBe('User creation payload');
    expect(schema.type).toBe('object');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 매핑되지 않는 룰 → 자동 스킵
// ─────────────────────────────────────────────────────────────────────────────

describe('toJsonSchema — 미등록 룰 스킵', () => {
  it('커스텀 룰은 에러 없이 무시', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'field');
    meta.validation.push(fakeRule('isString'));
    meta.validation.push(fakeRule('customRule', { foo: 'bar' }));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.field).toEqual({ type: 'string' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// groups 필터링 (§6.4)
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// whitelist → unevaluatedProperties: false (§7.2)
// ─────────────────────────────────────────────────────────────────────────────

describe('toJsonSchema — whitelist', () => {
  it('whitelist: true → unevaluatedProperties: false', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'name');
    meta.validation.push(fakeRule('isString'));

    const schema = toJsonSchema(Dto, { whitelist: true });
    expect(schema.unevaluatedProperties).toBe(false);
  });

  it('whitelist: false (기본) → unevaluatedProperties 미출력', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'name');
    meta.validation.push(fakeRule('isString'));

    const schema = toJsonSchema(Dto);
    expect(schema.unevaluatedProperties).toBeUndefined();
  });

  it('whitelist: $defs 내 중첩 스키마에도 적용', () => {
    const Inner = makeClass('Inner');
    const iMeta = ensureMeta(Inner, 'x');
    iMeta.validation.push(fakeRule('isNumber'));

    const Outer = makeClass('Outer');
    const oMeta = ensureMeta(Outer, 'inner');
    oMeta.type = { fn: () => Inner as any };
    oMeta.flags.validateNested = true;

    const schema = toJsonSchema(Outer, { whitelist: true });
    expect(schema.unevaluatedProperties).toBe(false);
    expect(schema.$defs!.Inner!.unevaluatedProperties).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// min/max exclusive → exclusiveMinimum/Maximum (§7.1)
// ─────────────────────────────────────────────────────────────────────────────

describe('toJsonSchema — exclusive min/max', () => {
  it('min(n, {exclusive:true}) → exclusiveMinimum', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'val');
    meta.validation.push(fakeRule('min', { min: 0, exclusive: true }));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.val).toEqual({ exclusiveMinimum: 0 });
  });

  it('max(n, {exclusive:true}) → exclusiveMaximum', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'val');
    meta.validation.push(fakeRule('max', { max: 100, exclusive: true }));

    const schema = toJsonSchema(Dto);
    expect(schema.properties!.val).toEqual({ exclusiveMaximum: 100 });
  });
});

describe('toJsonSchema — groups', () => {
  it('groups 필터링으로 특정 그룹의 룰만 포함', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'name');
    meta.validation.push(fakeRule('isString'));
    meta.validation.push({
      ...fakeRule('minLength', { min: 3 }),
      groups: ['create'],
    });
    meta.validation.push({
      ...fakeRule('maxLength', { max: 100 }),
      groups: ['update'],
    });

    const create = toJsonSchema(Dto, { groups: ['create'] });
    expect(create.properties!.name).toEqual({
      type: 'string', minLength: 3,
    });

    const update = toJsonSchema(Dto, { groups: ['update'] });
    expect(update.properties!.name).toEqual({
      type: 'string', maxLength: 100,
    });
  });

  it('groups 미지정 → 모든 룰 포함', () => {
    const Dto = makeClass();
    const meta = ensureMeta(Dto, 'name');
    meta.validation.push(fakeRule('isString'));
    meta.validation.push({
      ...fakeRule('minLength', { min: 3 }),
      groups: ['create'],
    });

    const all = toJsonSchema(Dto);
    expect(all.properties!.name).toEqual({
      type: 'string', minLength: 3,
    });
  });
});
