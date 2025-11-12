import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';

export class ReconcileDto {
  @IsArray()
  @IsInt({ each: true })
  lineIds: number[];

  @IsBoolean()
  reconciled: boolean;

  @IsOptional()
  @IsString()
  bankRef?: string;
}
