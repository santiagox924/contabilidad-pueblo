import { IsInt, Min, Max } from 'class-validator';

export class PeriodIdDto {
  @IsInt()
  @Min(2000)
  year: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month: number;
}
