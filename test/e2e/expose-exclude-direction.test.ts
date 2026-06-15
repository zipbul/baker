import { describe, it, expect } from 'bun:test';

import { Baker, ExcludeMode, Field, deserialize, serialize } from '../../index';
import { isString } from '../../src/rules/index';

const baker = new Baker();

// ─────────────────────────────────────────────────────────────────────────────

@baker.Recipe
class DirectionDto {
  @Field(isString, { deserializeName: 'user_name', serializeName: 'userName' })
  name!: string;

  @Field(isString, { exclude: ExcludeMode.SerializeOnly })
  password!: string;

  @Field(isString, { exclude: ExcludeMode.DeserializeOnly })
  token!: string;

  @Field(isString, { exclude: true })
  internal!: string;
}

baker.seal();

// ─────────────────────────────────────────────────────────────────────────────

describe('@Expose/@Exclude direction — deserialize', () => {
  it('deserializeOnly @Expose name used for extraction', async () => {
    const result = (await deserialize<DirectionDto>(DirectionDto, {
      user_name: 'Alice',
      password: 'pw123',
      token: 'tok',
      internal: 'x',
    })) as DirectionDto;
    expect(result.name).toBe('Alice');
  });

  it('serializeOnly @Exclude → included in deserialize', async () => {
    const result = (await deserialize<DirectionDto>(DirectionDto, {
      user_name: 'Alice',
      password: 'pw123',
      token: 'tok',
      internal: 'x',
    })) as DirectionDto;
    expect(result.password).toBe('pw123');
  });

  it('deserializeOnly @Exclude → excluded from deserialize', async () => {
    const result = (await deserialize<DirectionDto>(DirectionDto, {
      user_name: 'Alice',
      password: 'pw123',
      token: 'tok',
      internal: 'x',
    })) as DirectionDto;
    expect(result.token).toBeUndefined();
  });

  it('bidirectional @Exclude → excluded from deserialize', async () => {
    const result = (await deserialize<DirectionDto>(DirectionDto, {
      user_name: 'Alice',
      password: 'pw123',
      token: 'tok',
      internal: 'x',
    })) as DirectionDto;
    expect(result.internal).toBeUndefined();
  });
});

describe('@Expose/@Exclude direction — serialize', () => {
  it('serializeOnly @Expose name used for output', async () => {
    const dto = Object.assign(new DirectionDto(), {
      name: 'Bob',
      password: 'pw',
      token: 'tok',
      internal: 'x',
    });
    const result = await serialize(dto);
    expect(result['userName']).toBe('Bob');
    expect(result['user_name']).toBeUndefined();
  });

  it('serializeOnly @Exclude → excluded from serialize', async () => {
    const dto = Object.assign(new DirectionDto(), {
      name: 'Bob',
      password: 'pw',
      token: 'tok',
      internal: 'x',
    });
    const result = await serialize(dto);
    expect(result['password']).toBeUndefined();
  });

  it('bidirectional @Exclude → excluded from serialize', async () => {
    const dto = Object.assign(new DirectionDto(), {
      name: 'Bob',
      password: 'pw',
      token: 'tok',
      internal: 'x',
    });
    const result = await serialize(dto);
    expect(result['internal']).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// debug: true — exclude/expose debug comments in generated code
// ─────────────────────────────────────────────────────────────────────────────

describe('@Expose/@Exclude direction — debug mode', () => {
  const debugBaker = new Baker({ debug: true });

  @debugBaker.Recipe
  class DebugDirectionDto {
    @Field(isString, { deserializeName: 'user_name', serializeName: 'userName' })
    name!: string;

    @Field(isString, { exclude: ExcludeMode.SerializeOnly })
    password!: string;

    @Field(isString, { exclude: ExcludeMode.DeserializeOnly })
    token!: string;

    @Field(isString, { exclude: true })
    internal!: string;
  }

  debugBaker.seal();

  it('deserialize with debug: true still excludes fields correctly', async () => {
    const result = (await deserialize<DebugDirectionDto>(DebugDirectionDto, {
      user_name: 'Alice',
      password: 'pw123',
      token: 'tok',
      internal: 'x',
    })) as DebugDirectionDto;
    // deserializeOnly exclude → token excluded
    expect(result.token).toBeUndefined();
    // bidirectional exclude → internal excluded
    expect(result.internal).toBeUndefined();
    // serializeOnly exclude → password included in deserialize
    expect(result.password).toBe('pw123');
  });

  it('serialize with debug: true still excludes fields correctly', async () => {
    const dto = Object.assign(new DebugDirectionDto(), {
      name: 'Bob',
      password: 'pw',
      token: 'tok',
      internal: 'x',
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
  it('field with only serializeOnly @Expose is excluded from deserialize with debug', async () => {
    const b = new Baker({ debug: true });
    @b.Recipe
    class SerializeOnlyExposeDto {
      @Field(isString)
      name!: string;

      @Field(isString, { serializeName: 'out_secret' })
      secret!: string;
    }
    b.seal();
    const result = (await deserialize<SerializeOnlyExposeDto>(SerializeOnlyExposeDto, {
      name: 'Alice',
      secret: 'hidden',
    })) as SerializeOnlyExposeDto;
    expect(result.name).toBe('Alice');
  });

  it('field with only deserializeOnly @Expose is excluded from serialize with debug', async () => {
    const b = new Baker({ debug: true });
    @b.Recipe
    class DeserializeOnlyExposeDto {
      @Field(isString)
      name!: string;

      @Field(isString, { deserializeName: 'in_secret' })
      secret!: string;
    }
    b.seal();
    const dto = Object.assign(new DeserializeOnlyExposeDto(), { name: 'Alice', secret: 'hidden' });
    const result = await serialize(dto);
    expect(result['name']).toBe('Alice');
    // deserializeOnly expose → excluded from serialize
    expect(result['secret']).toBeUndefined();
    expect(result['in_secret']).toBeUndefined();
  });
});
