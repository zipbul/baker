// Legacy-decorator comparison: class-validator for the nested 3-level benchmark.
// Run under bench/class-validator/tsconfig.json (experimentalDecorators ON), from this directory.
import { plainToInstance, Type as CvType } from 'class-transformer';
import { IsString, IsNumber, Min, MinLength, ValidateNested, validateSync } from 'class-validator';
import { bench, group, run } from 'mitata';
import * as reflectMetadata from 'reflect-metadata';

import { NESTED_VALID, NESTED_INVALID } from '../data';

class CvAddress {
  @IsString() @MinLength(1) street!: string;
  @IsString() @MinLength(1) city!: string;
  @IsString() @MinLength(1) zip!: string;
}
class CvCustomer {
  @IsString() @MinLength(1) name!: string;
  @IsString() email!: string;
  @ValidateNested() @CvType(() => CvAddress) address!: CvAddress;
}
class CvOrder {
  @IsString() @MinLength(1) title!: string;
  @ValidateNested() @CvType(() => CvCustomer) customer!: CvCustomer;
  @IsNumber() @Min(0) priority!: number;
}

void reflectMetadata;
let sinkNum = 0;

group('nested 3-level — valid input (class-validator)', () => {
  bench('class-validator', () => {
    const inst = plainToInstance(CvOrder, NESTED_VALID);
    sinkNum += validateSync(inst).length;
  });
});

group('nested 3-level — invalid input (class-validator)', () => {
  bench('class-validator', () => {
    const inst = plainToInstance(CvOrder, NESTED_INVALID);
    sinkNum += validateSync(inst).length;
  });
});

await run();
if (sinkNum === -1) {
  console.log('unreachable', sinkNum);
}
