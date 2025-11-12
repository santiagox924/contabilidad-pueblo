import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { TaxesService } from './taxes.service';
import { CreateTaxDto } from './dto/create-tax.dto';
import { UpdateTaxDto } from './dto/update-tax.dto';
import { TaxKind } from '@prisma/client';

@Controller('taxes')
export class TaxesController {
  constructor(private readonly taxesService: TaxesService) {}

  // -------- CRUD --------
  @Post()
  create(@Body() dto: CreateTaxDto) {
    return this.taxesService.create(dto);
  }

  @Get()
  findAll(@Query('active') active?: string, @Query('kind') kind?: TaxKind) {
    const params = {
      active: active === undefined ? undefined : active === 'true',
      kind,
    };
    return this.taxesService.findAll(params);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.taxesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTaxDto) {
    return this.taxesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.taxesService.remove(id);
  }

  // -------- Cálculo de IVA --------
  @Post('calc-line')
  calcLine(
    @Body()
    body: {
      taxId?: number;
      ratePct?: number;
      lineSubtotal: number;
      included?: boolean;
    },
  ) {
    return this.taxesService.calculateLine(body);
  }

  @Post('calc-invoice')
  calcInvoice(
    @Body()
    body: {
      lines: {
        taxId?: number;
        ratePct?: number;
        lineSubtotal: number;
        included?: boolean;
      }[];
    },
  ) {
    return this.taxesService.calculateInvoice(body);
  }
}
