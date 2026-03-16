import { describe, it, expect, afterEach } from 'bun:test';
import { Field, deserialize, serialize, configure } from '../../index';
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

// ─────────────────────────────────────────────────────────────────────────────
// debug: true — exclude/expose debug comments in generated code
// ─────────────────────────────────────────────────────────────────────────────

describe('@Expose/@Exclude direction — debug mode', () => {
  it('deserialize with debug: true still excludes fields correctly', async () => {
    unseal();
    configure({ debug: true });
    const result = await deserialize<DirectionDto>(DirectionDto, {
      user_name: 'Alice', password: 'pw123', token: 'tok', internal: 'x',
    });
    // deserializeOnly exclude → token excluded
    expect(result.token).toBeUndefined();
    // bidirectional exclude → internal excluded
    expect(result.internal).toBeUndefined();
    // serializeOnly exclude → password included in deserialize
    expect(result.password).toBe('pw123');
  });

  it('serialize with debug: true still excludes fields correctly', async () => {
    unseal();
    configure({ debug: true });
    const dto = Object.assign(new DirectionDto(), {
      name: 'Bob', password: 'pw', token: 'tok', internal: 'x',
    });
    const result = await serialize(dto);
    // serializeOnly exclude → password excluded
    expect(result['password']).toBeUndefined();
    // bidirectional exclude → internal excluded
    expect(result['internal']).toBeUndefined();
    // deserializeOnly exclude → token included in serialize
    expect(result['token']).toBe('tok');
  });
});

describe('@Expose serializeOnly — debug mode deserialize skip', () => {
  class SerializeOnlyExposeDto {
    @Field(isString)
    name!: string;

    @Field(isString, { serializeName: 'out_secret' })
    secret!: string;
  }

  it('field with only serializeOnly @Expose is excluded from deserialize with debug', async () => {
    unseal();
    configure({ debug: true });
    const result = await deserialize<SerializeOnlyExposeDto>(SerializeOnlyExposeDto, {
      name: 'Alice', secret: 'hidden',
    });
    expect(result.name).toBe('Alice');
  });

  it('field with only deserializeOnly @Expose is excluded from serialize with debug', async () => {
    class DeserializeOnlyExposeDto {
      @Field(isString)
      name!: string;

      @Field(isString, { deserializeName: 'in_secret' })
      secret!: string;
    }
    unseal();
    configure({ debug: true });
    const dto = Object.assign(new DeserializeOnlyExposeDto(), { name: 'Alice', secret: 'hidden' });
    const result = await serialize(dto);
    expect(result['name']).toBe('Alice');
    // deserializeOnly expose → excluded from serialize
    expect(result['secret']).toBeUndefined();
    expect(result['in_secret']).toBeUndefined();
  });
});
