import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PosService } from './pos.service';
import { CashMovementKind } from '@prisma/client';

/**
 * ============ DTOs ============
 */
class CreateRegisterDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  location?: string;
}

class OpenSessionDto {
  @IsInt()
  @IsPositive()
  registerId!: number;

  @IsInt()
  @IsPositive()
  userId!: number;

  @IsNumber()
  @Min(0)
  openingAmount!: number;

  @IsString()
  @IsOptional()
  note?: string;
}

class CashCountRowDto {
  @IsString()
  @IsNotEmpty()
  denom!: string; // "100000", "50000", etc.

  @IsInt()
  @Min(0)
  qty!: number;
}

class CloseSessionDto {
  @IsNumber()
  @Min(0)
  countedClose!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CashCountRowDto)
  counts!: CashCountRowDto[];

  @IsString()
  @IsOptional()
  note?: string;
}

class AddMovementDto {
  @IsEnum(CashMovementKind)
  kind!: CashMovementKind; // CASH_IN | CASH_OUT | REFUND

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsString()
  @IsOptional()
  note?: string;
}

@Controller('pos')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class PosController {
  constructor(private readonly svc: PosService) {}

  // ----- Cajas -----
  @Get('registers')
  listRegisters() {
    return this.svc.listRegisters();
  }

  @Post('registers')
  createRegister(@Body() dto: CreateRegisterDto) {
    return this.svc.createRegister(dto);
  }

  // ----- Sesiones -----
  @Post('sessions/open')
  openSession(@Body() dto: OpenSessionDto) {
    return this.svc.openSession(dto);
  }

  @Get('sessions/active')
  getActiveSession(
    @Query('registerId', ParseIntPipe) registerId: number,
    @Query('userId', ParseIntPipe) userId: number,
  ) {
    return this.svc.getActiveSession({ registerId, userId });
  }

  @Patch('sessions/:id/close')
  closeSession(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CloseSessionDto,
  ) {
    return this.svc.closeSession(id, dto);
  }

  // ----- Movimientos manuales -----
  @Post('sessions/:id/movements')
  addMovement(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddMovementDto,
  ) {
    return this.svc.addMovement(id, dto);
  }
}
