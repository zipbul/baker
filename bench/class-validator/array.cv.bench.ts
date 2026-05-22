// Legacy-decorator comparison: class-validator for the array-of-1000 benchmark.
// Run under bench/class-validator/tsconfig.json (experimentalDecorators ON), from this directory.
import { plainToInstance, Type as CvType } from 'class-transformer';
import { IsString, IsNumber, Min, ValidateNested, ArrayMinSize, validateSync } from 'class-validator';
import { bench, group, run } from 'mitata';
import * as reflectMetadata from 'reflect-metadata';

import { ARRAY_VALID } from '../data';

class CvItem {
  @IsString() name!: string;
  @IsNumber() @Min(0) value!: number;
}
class CvList {
  @ValidateNested({ each: true }) @ArrayMinSize(1) @CvType(() => CvItem) items!: CvItem[];
}

void reflectMetadata;
let sinkNum = 0;

group('array 1000 items — valid input (class-validator)', () => {
  bench('class-validator', () => {
    const inst = plainToInstance(CvList, ARRAY_VALID);
    sinkNum += validateSync(inst).length;
  });
});

await run();
if (sinkNum === -1) {
  console.log('unreachable', sinkNum);
}
