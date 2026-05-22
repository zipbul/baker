// Legacy-decorator comparison: class-validator for the error-collection benchmark.
// Run under bench/class-validator/tsconfig.json (experimentalDecorators ON), from this directory.
import { plainToInstance } from 'class-transformer';
import { IsNumber, Min, validateSync } from 'class-validator';
import { bench, group, run } from 'mitata';
import * as reflectMetadata from 'reflect-metadata';

import { ERROR_ALL_FAIL } from '../data';

class CvErrors {
  @IsNumber() @Min(1) f0!: number;
  @IsNumber() @Min(1) f1!: number;
  @IsNumber() @Min(1) f2!: number;
  @IsNumber() @Min(1) f3!: number;
  @IsNumber() @Min(1) f4!: number;
  @IsNumber() @Min(1) f5!: number;
  @IsNumber() @Min(1) f6!: number;
  @IsNumber() @Min(1) f7!: number;
  @IsNumber() @Min(1) f8!: number;
  @IsNumber() @Min(1) f9!: number;
}

void reflectMetadata;
let sinkNum = 0;

group('error collection — all fail (class-validator)', () => {
  bench('class-validator', () => {
    const inst = plainToInstance(CvErrors, ERROR_ALL_FAIL);
    sinkNum += validateSync(inst).length;
  });
});

await run();
if (sinkNum === -1) {
  console.log('unreachable', sinkNum);
}
