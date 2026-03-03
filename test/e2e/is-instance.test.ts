import { describe, it, expect, afterEach } from 'bun:test';
import { seal, deserialize, BakerValidationError, IsInstance, Transform } from '../../index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class MyDate extends Date {}

class InstanceDto {
  @Transform(({ value }) => {
    if (typeof value === 'string') return new MyDate(value);
    return value;
  })
  @IsInstance(MyDate)
  date!: MyDate;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('@IsInstance', () => {
  it('올바른 인스턴스 통과', async () => {
    seal();
    const r = await deserialize<InstanceDto>(InstanceDto, { date: '2024-01-01' });
    expect(r.date).toBeInstanceOf(MyDate);
  });

  it('잘못된 타입 거부', async () => {
    class WrongDto {
      @IsInstance(MyDate)
      date!: MyDate;
    }

    seal();

    // 문자열은 MyDate 인스턴스가 아님 (Transform 없이 raw string 전달)
    await expect(
      deserialize(WrongDto, { date: '2024-01-01' }),
    ).rejects.toThrow(BakerValidationError);
  });
});
