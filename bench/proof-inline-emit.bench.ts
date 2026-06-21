import { bench, group, run } from 'mitata';

import { Baker, Field } from '../index';
import {
  isNumberString,
  isISBN,
  isISIN,
  isISO8601,
  isISSN,
  isFQDN,
  isEAN,
  isJSON,
  isIBAN,
  isByteLength,
  isLatitude,
  isLongitude,
  isStrongPassword,
} from '../src/rules/index';
import { isNotEmptyObject } from '../src/rules/object';

const baker = new Baker();

// ── DTOs ────────────────────────────────────────────────────────────────────

@baker.Recipe
class NumberStringDto {
  @Field(isNumberString()) value!: string;
}
@baker.Recipe
class ISBNDto {
  @Field(isISBN(13)) value!: string;
}
@baker.Recipe
class ISINDto {
  @Field(isISIN) value!: string;
}
@baker.Recipe
class ISO8601StrictDto {
  @Field(isISO8601({ strict: true })) value!: string;
}
@baker.Recipe
class ISSNDto {
  @Field(isISSN()) value!: string;
}
@baker.Recipe
class FQDNDto {
  @Field(isFQDN()) value!: string;
}
@baker.Recipe
class EANDto {
  @Field(isEAN) value!: string;
}
@baker.Recipe
class JSONDto {
  @Field(isJSON) value!: string;
}
@baker.Recipe
class IBANDto {
  @Field(isIBAN()) value!: string;
}
@baker.Recipe
class ByteLengthDto {
  @Field(isByteLength(1, 100)) value!: string;
}
@baker.Recipe
class LatitudeDto {
  @Field(isLatitude) value!: number;
}
@baker.Recipe
class LongitudeDto {
  @Field(isLongitude) value!: number;
}
@baker.Recipe
class StrongPasswordDto {
  @Field(isStrongPassword()) value!: string;
}
@baker.Recipe
class NotEmptyObjDto {
  @Field(isNotEmptyObject({ nullable: true })) value!: object;
}

// Warm seal
baker.seal();
baker.deserialize(NumberStringDto, { value: '123' });
baker.deserialize(ISBNDto, { value: '9780306406157' });
baker.deserialize(ISINDto, { value: 'US0378331005' });
baker.deserialize(ISO8601StrictDto, { value: '2024-01-15T10:30:00Z' });
baker.deserialize(ISSNDto, { value: '0378-5955' });
baker.deserialize(FQDNDto, { value: 'example.com' });
baker.deserialize(EANDto, { value: '73513537' });
baker.deserialize(JSONDto, { value: '{"a":1}' });
baker.deserialize(IBANDto, { value: 'DE89370400440532013000' });
baker.deserialize(ByteLengthDto, { value: 'hello' });
baker.deserialize(LatitudeDto, { value: 45.5 });
baker.deserialize(LongitudeDto, { value: -122.6 });
baker.deserialize(StrongPasswordDto, { value: 'Str0ng!Pass' });
baker.deserialize(NotEmptyObjDto, { value: { a: 1 } });

let sink: unknown;

group('proof — inline emit validators (previously refs)', () => {
  bench('isNumberString', () => {
    sink = baker.deserialize(NumberStringDto, { value: '123' });
  });
  bench('isISBN(13)', () => {
    sink = baker.deserialize(ISBNDto, { value: '9780306406157' });
  });
  bench('isISIN', () => {
    sink = baker.deserialize(ISINDto, { value: 'US0378331005' });
  });
  bench('isISO8601(strict)', () => {
    sink = baker.deserialize(ISO8601StrictDto, { value: '2024-01-15T10:30:00Z' });
  });
  bench('isISSN', () => {
    sink = baker.deserialize(ISSNDto, { value: '0378-5955' });
  });
  bench('isFQDN', () => {
    sink = baker.deserialize(FQDNDto, { value: 'example.com' });
  });
  bench('isEAN', () => {
    sink = baker.deserialize(EANDto, { value: '73513537' });
  });
  bench('isJSON', () => {
    sink = baker.deserialize(JSONDto, { value: '{"a":1}' });
  });
  bench('isIBAN', () => {
    sink = baker.deserialize(IBANDto, { value: 'DE89370400440532013000' });
  });
  bench('isByteLength', () => {
    sink = baker.deserialize(ByteLengthDto, { value: 'hello' });
  });
  bench('isLatitude', () => {
    sink = baker.deserialize(LatitudeDto, { value: 45.5 });
  });
  bench('isLongitude', () => {
    sink = baker.deserialize(LongitudeDto, { value: -122.6 });
  });
  bench('isStrongPassword', () => {
    sink = baker.deserialize(StrongPasswordDto, { value: 'Str0ng!Pass' });
  });
  bench('isNotEmptyObject(nullable)', () => {
    sink = baker.deserialize(NotEmptyObjDto, { value: { a: 1 } });
  });
});

await run();

// Force tsc to treat 'sink' as used (it's a DCE-prevention write-only target).
void sink;
