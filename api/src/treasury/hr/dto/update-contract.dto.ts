import { PartialType } from '@nestjs/mapped-types';
import { CreateEmploymentContractDto } from './create-contract.dto';

export class UpdateEmploymentContractDto extends PartialType(
  CreateEmploymentContractDto,
) {}
