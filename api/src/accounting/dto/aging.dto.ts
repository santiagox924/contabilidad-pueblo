import { IsDateString, IsIn } from 'class-validator';

export class AgingDto {
  @IsDateString()
  asOf: string;

  @IsIn(['AR', 'AP'])
  scope: 'AR' | 'AP';
}
