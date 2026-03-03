import { describe, it, expect, afterEach } from 'bun:test';
import { seal, deserialize, serialize, IsString, IsNumber, Expose, Exclude } from '../../index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class DirectionDto {
  @IsString()
  @Expose({ name: 'user_name', deserializeOnly: true })
  @Expose({ name: 'userName', serializeOnly: true })
  name!: string;

  @IsString()
  @Exclude({ serializeOnly: true })
  password!: string;

  @IsString()
  @Exclude({ deserializeOnly: true })
  token!: string;

  @IsString()
  @Exclude()
  internal!: string;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('@Expose/@Exclude direction — deserialize', () => {
  it('deserializeOnly @Expose name으로 추출', async () => {
    seal();
    const result = await deserialize<DirectionDto>(DirectionDto, {
      user_name: 'Alice', password: 'pw123', token: 'tok', internal: 'x',
    });
    expect(result.name).toBe('Alice');
  });

  it('serializeOnly @Exclude → deserialize에서는 포함', async () => {
    seal();
    const result = await deserialize<DirectionDto>(DirectionDto, {
      user_name: 'Alice', password: 'pw123', token: 'tok', internal: 'x',
    });
    expect(result.password).toBe('pw123');
  });

  it('deserializeOnly @Exclude → deserialize에서 제외', async () => {
    seal();
    const result = await deserialize<DirectionDto>(DirectionDto, {
      user_name: 'Alice', password: 'pw123', token: 'tok', internal: 'x',
    });
    expect(result.token).toBeUndefined();
  });

  it('양방향 @Exclude → deserialize에서 제외', async () => {
    seal();
    const result = await deserialize<DirectionDto>(DirectionDto, {
      user_name: 'Alice', password: 'pw123', token: 'tok', internal: 'x',
    });
    expect(result.internal).toBeUndefined();
  });
});

describe('@Expose/@Exclude direction — serialize', () => {
  it('serializeOnly @Expose name으로 출력', async () => {
    seal();
    const dto = Object.assign(new DirectionDto(), {
      name: 'Bob', password: 'pw', token: 'tok', internal: 'x',
    });
    const result = await serialize(dto);
    expect(result['userName']).toBe('Bob');
    expect(result['user_name']).toBeUndefined();
  });

  it('serializeOnly @Exclude → serialize에서 제외', async () => {
    seal();
    const dto = Object.assign(new DirectionDto(), {
      name: 'Bob', password: 'pw', token: 'tok', internal: 'x',
    });
    const result = await serialize(dto);
    expect(result['password']).toBeUndefined();
  });

  it('양방향 @Exclude → serialize에서 제외', async () => {
    seal();
    const dto = Object.assign(new DirectionDto(), {
      name: 'Bob', password: 'pw', token: 'tok', internal: 'x',
    });
    const result = await serialize(dto);
    expect(result['internal']).toBeUndefined();
  });
});
