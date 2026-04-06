import { bench, group, run } from 'mitata';
import { Field, deserialize } from '../index';
import {
  isNumberString, isISBN, isISIN, isISO8601, isISSN, isFQDN,
  isEAN, isJSON, isIBAN, isByteLength, isLatitude, isLongitude,
  isStrongPassword,
} from '../src/rules/index';
import { isNotEmptyObject } from '../src/rules/object';

// ── DTOs ────────────────────────────────────────────────────────────────────

class NumberStringDto {
  @Field(isNumberString()) value!: string;
}
class ISBNDto {
  @Field(isISBN(13)) value!: string;
}
class ISINDto {
  @Field(isISIN) value!: string;
}
class ISO8601StrictDto {
  @Field(isISO8601({ strict: true })) value!: string;
}
class ISSNDto {
  @Field(isISSN()) value!: string;
}
class FQDNDto {
  @Field(isFQDN()) value!: string;
}
class EANDto {
  @Field(isEAN) value!: string;
}
class JSONDto {
  @Field(isJSON) value!: string;
}
class IBANDto {
  @Field(isIBAN()) value!: string;
}
class ByteLengthDto {
  @Field(isByteLength(1, 100)) value!: string;
}
class LatitudeDto {
  @Field(isLatitude) value!: number;
}
class LongitudeDto {
  @Field(isLongitude) value!: number;
}
class StrongPasswordDto {
  @Field(isStrongPassword()) value!: string;
}
class NotEmptyObjDto {
  @Field(isNotEmptyObject({ nullable: true })) value!: object;
}

// Warm seal
deserialize(NumberStringDto, { value: '123' });
deserialize(ISBNDto, { value: '9780306406157' });
deserialize(ISINDto, { value: 'US0378331005' });
deserialize(ISO8601StrictDto, { value: '2024-01-15T10:30:00Z' });
deserialize(ISSNDto, { value: '0378-5955' });
deserialize(FQDNDto, { value: 'example.com' });
deserialize(EANDto, { value: '73513537' });
deserialize(JSONDto, { value: '{"a":1}' });
deserialize(IBANDto, { value: 'DE89370400440532013000' });
deserialize(ByteLengthDto, { value: 'hello' });
deserialize(LatitudeDto, { value: 45.5 });
deserialize(LongitudeDto, { value: -122.6 });
deserialize(StrongPasswordDto, { value: 'Str0ng!Pass' });
deserialize(NotEmptyObjDto, { value: { a: 1 } });

let sink: unknown;

group('proof — inline emit validators (previously refs)', () => {
  bench('isNumberString', () => { sink = deserialize(NumberStringDto, { value: '123' }); });
  bench('isISBN(13)', () => { sink = deserialize(ISBNDto, { value: '9780306406157' }); });
  bench('isISIN', () => { sink = deserialize(ISINDto, { value: 'US0378331005' }); });
  bench('isISO8601(strict)', () => { sink = deserialize(ISO8601StrictDto, { value: '2024-01-15T10:30:00Z' }); });
  bench('isISSN', () => { sink = deserialize(ISSNDto, { value: '0378-5955' }); });
  bench('isFQDN', () => { sink = deserialize(FQDNDto, { value: 'example.com' }); });
  bench('isEAN', () => { sink = deserialize(EANDto, { value: '73513537' }); });
  bench('isJSON', () => { sink = deserialize(JSONDto, { value: '{"a":1}' }); });
  bench('isIBAN', () => { sink = deserialize(IBANDto, { value: 'DE89370400440532013000' }); });
  bench('isByteLength', () => { sink = deserialize(ByteLengthDto, { value: 'hello' }); });
  bench('isLatitude', () => { sink = deserialize(LatitudeDto, { value: 45.5 }); });
  bench('isLongitude', () => { sink = deserialize(LongitudeDto, { value: -122.6 }); });
  bench('isStrongPassword', () => { sink = deserialize(StrongPasswordDto, { value: 'Str0ng!Pass' }); });
  bench('isNotEmptyObject(nullable)', () => { sink = deserialize(NotEmptyObjDto, { value: { a: 1 } }); });
});

await run();
