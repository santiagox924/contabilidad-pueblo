import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { WithholdingsService } from './withholdings.service';
import { CreateWithholdingRuleDto } from './dto/create-withholding-rule.dto';
import { UpdateWithholdingRuleDto } from './dto/update-withholding-rule.dto';
import { RuleScope, WithholdingType } from '@prisma/client';

@Controller('withholdings')
export class WithholdingsController {
  constructor(private readonly service: WithholdingsService) {}

  // ---------- CRUD de reglas (ruta: /withholdings/rules) ----------
  @Post('rules')
  createRule(@Body() dto: CreateWithholdingRuleDto) {
    return this.service.createRule(dto);
  }

  @Get('rules')
  findRules(
    @Query('active') active?: string,
    @Query('scope') scope?: RuleScope,
    @Query('type') type?: WithholdingType,
  ) {
    return this.service.findRules({
      active: active === undefined ? undefined : active === 'true',
      scope,
      type,
    });
  }

  @Get('rules/:id')
  findRule(@Param('id', ParseIntPipe) id: number) {
    return this.service.findRule(id);
  }

  @Patch('rules/:id')
  updateRule(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWithholdingRuleDto,
  ) {
    return this.service.updateRule(id, dto);
  }

  @Delete('rules/:id')
  removeRule(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeRule(id);
  }

  // ---------- Cálculo ----------
  @Post('calc-line')
  calcLine(
    @Body()
    body: {
      base: number;
      vatAmount?: number;
      type?: WithholdingType;
      scope: RuleScope;
      operationDate?: string;
      thirdParty?: {
        id?: number;
        isWithholdingAgent?: boolean;
        ciiuCode?: string;
        municipalityCode?: string;
        departmentCode?: string;
      };
      thirdPartyId?: number;
    },
  ) {
    return this.service.calculateForLine(body);
  }

  @Post('calc-invoice')
  calcInvoice(
    @Body()
    body: {
      scope: RuleScope;
      operationDate?: string;
      thirdParty?: {
        id?: number;
        isWithholdingAgent?: boolean;
        ciiuCode?: string;
        municipalityCode?: string;
        departmentCode?: string;
      };
      thirdPartyId?: number;
      lines: {
        base: number;
        vatAmount?: number;
        type?: WithholdingType;
        scope?: RuleScope;
        operationDate?: string;
        thirdParty?: {
          id?: number;
          isWithholdingAgent?: boolean;
          ciiuCode?: string;
          municipalityCode?: string;
          departmentCode?: string;
        };
        thirdPartyId?: number;
      }[];
    },
  ) {
    return this.service.calculateForInvoice(body);
  }
}
