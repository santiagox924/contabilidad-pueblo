// api/src/parties/dto/update-party.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreatePartyDto } from './create-party.dto';

export class UpdatePartyDto extends PartialType(CreatePartyDto) {}
