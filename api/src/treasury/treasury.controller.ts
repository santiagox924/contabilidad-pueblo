// api/src/treasury/treasury.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TreasuryService } from './treasury.service';
import { CreateCashReceiptDto } from './dto/create-cash-receipt.dto';
import { CreateVendorPaymentDto } from './dto/create-vendor-payment.dto';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';
import { CreateTransferDto } from './dto/create-transfer.dto';

@UseGuards(JwtAuthGuard)
@Controller('treasury')
export class TreasuryController {
  constructor(private readonly svc: TreasuryService) {}

  // =========================
  // Cobros a clientes
  // =========================
  @Post('receipts')
  async createReceipt(@Body() dto: CreateCashReceiptDto, @Req() req: any) {
    // Extrae el ID del usuario autenticado (ajusta según tu JwtStrategy)
    const userId = Number(req?.user?.id ?? req?.user?.userId ?? req?.user?.sub);
    if (!userId) {
      throw new BadRequestException(
        'Usuario no identificado para registrar en caja.',
      );
    }
    return this.svc.createReceipt({ ...dto, userId });
  }

  // =========================
  // Pagos a proveedores
  // =========================
  @Post('payments')
  async createPayment(@Body() dto: CreateVendorPaymentDto) {
    return this.svc.createPayment(dto);
  }

  // =========================
  // Métodos de pago
  // =========================
  @Post('methods')
  async createMethod(@Body() dto: CreatePaymentMethodDto) {
    return this.svc.createPaymentMethod(dto);
  }

  @Get('methods')
  async listMethods(@Query('active') active?: string) {
    const activeOnly = active == null ? true : active === 'true';
    return this.svc.listPaymentMethods(activeOnly);
  }

  @Get('methods/:id')
  async getMethod(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getPaymentMethod(id);
  }

  @Post('methods/:id')
  async updateMethod(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePaymentMethodDto,
  ) {
    return this.svc.updatePaymentMethod(id, dto);
  }

  // =========================
  // Transferencias bancarias
  // =========================
  @Post('transfer')
  async createTransfer(@Body() dto: CreateTransferDto) {
    return this.svc.createBankTransfer(dto);
  }

  // =========================
  // Saldos por método (opcional)
  // =========================
  @Get('methods/:id/balance')
  async getMethodBalance(
    @Param('id', ParseIntPipe) id: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.getPaymentMethodBalance(id, from, to);
  }
}
