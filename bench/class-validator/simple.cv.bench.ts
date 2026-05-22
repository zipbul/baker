// Legacy-decorator comparison: class-validator / class-transformer for the simple object.
// Runs in its own process under bench/class-validator/tsconfig.json (experimentalDecorators ON),
// since legacy decorators cannot coexist with baker's modern decorators in one process.
import { plainToInstance } from 'class-transformer';
import { IsString, IsEmail, IsNumber, IsBoolean, Min, Max, MinLength, validateSync } from 'class-validator';
import { bench, group, run } from 'mitata';
import * as reflectMetadata from 'reflect-metadata';

import { SIMPLE_VALID, SIMPLE_INVALID } from '../data';

class CvSimple {
  @IsString() @MinLength(2) name!: string;
  @IsString() @IsEmail() email!: string;
  @IsNumber() @Min(0) @Max(150) age!: number;
  @IsBoolean() active!: boolean;
  @IsString() tag!: string;
}

void reflectMetadata;
let sinkNum = 0;

group('simple object — valid input (class-validator)', () => {
  bench('class-validator', () => {
    const inst = plainToInstance(CvSimple, SIMPLE_VALID);
    const errs = validateSync(inst);
    sinkNum += errs.length;
  });
});

group('simple object — invalid input (class-validator)', () => {
  bench('class-validator', () => {
    const inst = plainToInstance(CvSimple, SIMPLE_INVALID);
    const errs = validateSync(inst);
    sinkNum += errs.length;
  });
});

await run();
if (sinkNum === -1) {
  console.log('unreachable', sinkNum);
}
