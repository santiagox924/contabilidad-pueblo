import { IsDateString, IsIn } from 'class-validator';

export class VatReportDto {
  @IsDateString()
  from: string;

  @IsDateString()
  to: string;

  @IsIn(['SALES', 'PURCHASES'])
  kind: 'SALES' | 'PURCHASES';
}
