import { IsIn } from 'class-validator';

export class UpdateEntryStatusDto {
  @IsIn(['DRAFT', 'POSTED'])
  status: 'DRAFT' | 'POSTED';
}
