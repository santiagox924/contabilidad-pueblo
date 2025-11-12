// api/src/partners-fiscal/partners-fiscal.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { PartnersFiscalService } from './partners-fiscal.service';
import { UpdatePartnerFiscalDto } from './dto/update-partner-fiscal.dto';
import { FiscalRegime } from '@prisma/client';

@Controller('partners-fiscal')
export class PartnersFiscalController {
  constructor(private readonly service: PartnersFiscalService) {}

  // Obtener perfil fiscal de un tercero
  @Get(':thirdPartyId')
  getOne(@Param('thirdPartyId', ParseIntPipe) thirdPartyId: number) {
    return this.service.getProfile(thirdPartyId);
  }

  // Actualizar perfil fiscal de un tercero
  @Patch(':thirdPartyId')
  update(
    @Param('thirdPartyId', ParseIntPipe) thirdPartyId: number,
    @Body() dto: UpdatePartnerFiscalDto,
  ) {
    return this.service.updateProfile(thirdPartyId, dto);
  }

  // Listar por filtros (todos opcionales)
  @Get()
  list(
    @Query('isWithholdingAgent') isWithholdingAgent?: string,
    @Query('regime') regime?: FiscalRegime,
    @Query('municipalityCode') municipalityCode?: string,
    @Query('ciiuCode') ciiuCode?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    const parsed: { isWithholdingAgent?: boolean } = {};
    if (isWithholdingAgent !== undefined)
      parsed.isWithholdingAgent = isWithholdingAgent === 'true';

    return this.service.findMany({
      isWithholdingAgent: parsed.isWithholdingAgent,
      regime,
      municipalityCode: municipalityCode || undefined,
      ciiuCode: ciiuCode || undefined,
      take: take ? Number(take) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
  }
}
