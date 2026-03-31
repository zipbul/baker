import { describe, it, expect, afterEach } from 'bun:test';
import { Field, deserialize, serialize, isBakerError } from '../../index';
import {
  trimTransformer,
  toLowerCaseTransformer,
  toUpperCaseTransformer,
  roundTransformer,
  unixSecondsTransformer,
  unixMillisTransformer,
  isoStringTransformer,
  csvTransformer,
  jsonTransformer,
} from '../../src/transformers/index';
import { isString, isNumber, isDate } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─── 1. trimTransformer ─────────────────────────────────────────────────────

describe('trimTransformer', () => {
  class TrimDto {
    @Field(isString, { transform: trimTransformer })
    value!: string;
  }

  it('deserialize trims whitespace', async () => {
    const result = await deserialize<TrimDto>(TrimDto, { value: '  hello  ' }) as TrimDto;
    expect(result.value).toBe('hello');
  });

  it('serialize trims whitespace', async () => {
    const dto = Object.assign(new TrimDto(), { value: '  hello  ' });
    const plain = await serialize(dto);
    expect(plain.value).toBe('hello');
  });

  it('roundtrip', async () => {
    const result = await deserialize<TrimDto>(TrimDto, { value: '  hello  ' }) as TrimDto;
    const plain = await serialize(result);
    expect(plain.value).toBe('hello');
  });
});

// ─── 2. toLowerCaseTransformer ──────────────────────────────────────────────

describe('toLowerCaseTransformer', () => {
  class LowerDto {
    @Field(isString, { transform: toLowerCaseTransformer })
    value!: string;
  }

  it('deserialize lowercases', async () => {
    const result = await deserialize<LowerDto>(LowerDto, { value: 'HELLO' }) as LowerDto;
    expect(result.value).toBe('hello');
  });

  it('serialize lowercases', async () => {
    const dto = Object.assign(new LowerDto(), { value: 'HELLO' });
    const plain = await serialize(dto);
    expect(plain.value).toBe('hello');
  });
});

// ─── 3. toUpperCaseTransformer ──────────────────────────────────────────────

describe('toUpperCaseTransformer', () => {
  class UpperDto {
    @Field(isString, { transform: toUpperCaseTransformer })
    value!: string;
  }

  it('deserialize uppercases', async () => {
    const result = await deserialize<UpperDto>(UpperDto, { value: 'hello' }) as UpperDto;
    expect(result.value).toBe('HELLO');
  });

  it('serialize uppercases', async () => {
    const dto = Object.assign(new UpperDto(), { value: 'hello' });
    const plain = await serialize(dto);
    expect(plain.value).toBe('HELLO');
  });
});

// ─── 4. roundTransformer ────────────────────────────────────────────────────

describe('roundTransformer(2)', () => {
  class RoundDto {
    @Field(isNumber(), { transform: roundTransformer(2) })
    value!: number;
  }

  it('deserialize rounds to 2 decimals', async () => {
    const result = await deserialize<RoundDto>(RoundDto, { value: 10.456 }) as RoundDto;
    expect(result.value).toBe(10.46);
  });

  it('serialize rounds to 2 decimals', async () => {
    const dto = Object.assign(new RoundDto(), { value: 10.456 });
    const plain = await serialize(dto);
    expect(plain.value).toBe(10.46);
  });
});

// ─── 5. unixSecondsTransformer ──────────────────────────────────────────────

describe('unixSecondsTransformer', () => {
  class UnixSecDto {
    @Field(isDate, { transform: unixSecondsTransformer })
    value!: Date;
  }

  const epoch = 1704067200; // 2024-01-01T00:00:00Z
  const expectedDate = new Date(epoch * 1000);

  it('deserialize: unix seconds → Date', async () => {
    const result = await deserialize<UnixSecDto>(UnixSecDto, { value: epoch }) as UnixSecDto;
    expect(result.value).toBeInstanceOf(Date);
    expect(result.value.getTime()).toBe(expectedDate.getTime());
  });

  it('roundtrip: unix seconds → Date → unix seconds', async () => {
    const result = await deserialize<UnixSecDto>(UnixSecDto, { value: epoch }) as UnixSecDto;
    const plain = await serialize(result);
    expect(plain.value).toBe(epoch);
  });
});

// ─── 6. unixMillisTransformer ───────────────────────────────────────────────

describe('unixMillisTransformer', () => {
  class UnixMillisDto {
    @Field(isDate, { transform: unixMillisTransformer })
    value!: Date;
  }

  const epochMs = 1704067200000;
  const expectedDate = new Date(epochMs);

  it('deserialize: unix millis → Date', async () => {
    const result = await deserialize<UnixMillisDto>(UnixMillisDto, { value: epochMs }) as UnixMillisDto;
    expect(result.value).toBeInstanceOf(Date);
    expect(result.value.getTime()).toBe(expectedDate.getTime());
  });

  it('roundtrip: unix millis → Date → unix millis', async () => {
    const result = await deserialize<UnixMillisDto>(UnixMillisDto, { value: epochMs }) as UnixMillisDto;
    const plain = await serialize(result);
    expect(plain.value).toBe(epochMs);
  });
});

// ─── 7. isoStringTransformer ────────────────────────────────────────────────

describe('isoStringTransformer', () => {
  class IsoDto {
    @Field(isDate, { transform: isoStringTransformer })
    value!: Date;
  }

  const iso = '2024-01-01T00:00:00.000Z';

  it('deserialize: ISO string → Date', async () => {
    const result = await deserialize<IsoDto>(IsoDto, { value: iso }) as IsoDto;
    expect(result.value).toBeInstanceOf(Date);
    expect(result.value.toISOString()).toBe(iso);
  });

  it('roundtrip: ISO string → Date → ISO string', async () => {
    const result = await deserialize<IsoDto>(IsoDto, { value: iso }) as IsoDto;
    const plain = await serialize(result);
    expect(plain.value).toBe(iso);
  });
});

// ─── 8. csvTransformer ──────────────────────────────────────────────────────

describe('csvTransformer', () => {
  class CsvDto {
    @Field({ transform: csvTransformer(',') })
    value!: string[];
  }

  it('deserialize: CSV string → array', async () => {
    const result = await deserialize<CsvDto>(CsvDto, { value: 'a,b,c' }) as CsvDto;
    expect(result.value).toEqual(['a', 'b', 'c']);
  });

  it('roundtrip: CSV string → array → CSV string', async () => {
    const result = await deserialize<CsvDto>(CsvDto, { value: 'a,b,c' }) as CsvDto;
    const plain = await serialize(result);
    expect(plain.value).toBe('a,b,c');
  });
});

// ─── 9. jsonTransformer ─────────────────────────────────────────────────────

describe('jsonTransformer', () => {
  class JsonDto {
    @Field({ transform: jsonTransformer })
    value!: Record<string, unknown>;
  }

  it('deserialize: JSON string → object', async () => {
    const result = await deserialize<JsonDto>(JsonDto, { value: '{"a":1}' }) as JsonDto;
    expect(result.value).toEqual({ a: 1 });
  });

  it('roundtrip: JSON string → object → JSON string', async () => {
    const result = await deserialize<JsonDto>(JsonDto, { value: '{"a":1}' }) as JsonDto;
    const plain = await serialize(result);
    expect(plain.value).toBe('{"a":1}');
  });
});

// ─── transform array ────────────────────────────────────────────────────────

describe('transform array (pipeline)', () => {
  class PipeDto {
    @Field({ transform: [trimTransformer, toLowerCaseTransformer] })
    value!: string;
  }

  it('deserialize applies transforms in order: trim then lowercase', async () => {
    const result = await deserialize<PipeDto>(PipeDto, { value: '  HELLO  ' }) as PipeDto;
    expect(result.value).toBe('hello');
  });

  it('serialize applies transforms in reverse: lowercase then trim', async () => {
    const dto = Object.assign(new PipeDto(), { value: '  HELLO  ' });
    const plain = await serialize(dto);
    expect(plain.value).toBe('hello');
  });
});

// ─── type + transform combo ─────────────────────────────────────────────────

describe('type + transform combo (jsonTransformer + nested DTO)', () => {
  class NestedDto {
    @Field(isString)
    name!: string;
  }

  class WrapperDto {
    @Field({ transform: jsonTransformer, type: () => NestedDto })
    nested!: NestedDto;
  }

  it('deserialize: JSON string → parse → DTO instance with validation', async () => {
    const result = await deserialize<WrapperDto>(WrapperDto, {
      nested: '{"name":"alice"}',
    }) as WrapperDto;
    expect(result.nested).toBeInstanceOf(NestedDto);
    expect(result.nested.name).toBe('alice');
  });

  it('deserialize: invalid nested field returns BakerError', async () => {
    const result = await deserialize(WrapperDto, {
      nested: '{"name":123}',
    });
    expect(isBakerError(result)).toBe(true);
  });

  it('serialize: DTO instance → JSON string', async () => {
    const nested = Object.assign(new NestedDto(), { name: 'bob' });
    const dto = Object.assign(new WrapperDto(), { nested });
    const plain = await serialize(dto);
    // After serialize, nested is serialized to plain object first, then jsonTransformer stringifies
    expect(typeof plain.nested).toBe('string');
    expect(JSON.parse(plain.nested as string)).toEqual({ name: 'bob' });
  });
});
