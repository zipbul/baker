import { describe, it, expect, afterEach } from 'bun:test';
import { Field, deserialize, serialize } from '../../index';
import { isString } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class DirectionDto {
  @Field(isString, { deserializeName: 'user_name', serializeName: 'userName' })
  name!: string;

  @Field(isString, { exclude: 'serializeOnly' })
  password!: string;

  @Field(isString, { exclude: 'deserializeOnly' })
  token!: string;

  @Field(isString, { exclude: true })
  internal!: string;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('@Expose/@Exclude direction — deserialize', () => {
  it('deserializeOnly @Expose name으로 추출', async () => {
    const result = await deserialize<DirectionDto>(DirectionDto, {
      user_name: 'Alice', password: 'pw123', token: 'tok', internal: 'x',
    });
    expect(result.name).toBe('Alice');
  });

  it('serializeOnly @Exclude → deserialize에서는 포함', async () => {
    const result = await deserialize<DirectionDto>(DirectionDto, {
      user_name: 'Alice', password: 'pw123', token: 'tok', internal: 'x',
    });
    expect(result.password).toBe('pw123');
  });

  it('deserializeOnly @Exclude → deserialize에서 제외', async () => {
    const result = await deserialize<DirectionDto>(DirectionDto, {
      user_name: 'Alice', password: 'pw123', token: 'tok', internal: 'x',
    });
    expect(result.token).toBeUndefined();
  });

  it('양방향 @Exclude → deserialize에서 제외', async () => {
    const result = await deserialize<DirectionDto>(DirectionDto, {
      user_name: 'Alice', password: 'pw123', token: 'tok', internal: 'x',
    });
    expect(result.internal).toBeUndefined();
  });
});

describe('@Expose/@Exclude direction — serialize', () => {
  it('serializeOnly @Expose name으로 출력', async () => {
    const dto = Object.assign(new DirectionDto(), {
      name: 'Bob', password: 'pw', token: 'tok', internal: 'x',
    });
    const result = await serialize(dto);
    expect(result['userName']).toBe('Bob');
    expect(result['user_name']).toBeUndefined();
  });

  it('serializeOnly @Exclude → serialize에서 제외', async () => {
    const dto = Object.assign(new DirectionDto(), {
      name: 'Bob', password: 'pw', token: 'tok', internal: 'x',
    });
    const result = await serialize(dto);
    expect(result['password']).toBeUndefined();
  });

  it('양방향 @Exclude → serialize에서 제외', async () => {
    const dto = Object.assign(new DirectionDto(), {
      name: 'Bob', password: 'pw', token: 'tok', internal: 'x',
    });
    const result = await serialize(dto);
    expect(result['internal']).toBeUndefined();
  });
});
