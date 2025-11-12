import { PartialType } from '@nestjs/mapped-types';
import { CreateAffiliationDto } from './create-affiliation.dto';

export class UpdateAffiliationDto extends PartialType(CreateAffiliationDto) {}
