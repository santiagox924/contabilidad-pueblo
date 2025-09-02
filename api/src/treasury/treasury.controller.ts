import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TreasuryService } from './treasury.service';
import { CreateReceiptDto } from './dto/create-receipt.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';

@UseGuards(JwtAuthGuard)
@Controller('treasury')
export class TreasuryController {
  constructor(private readonly tre: TreasuryService) {}

  // Cobros (CxC)
  @Post('receipts')
  createReceipt(@Body() dto: CreateReceiptDto) {
    return this.tre.createReceipt(dto);
  }

  // Pagos (CxP)
  @Post('payments')
  createPayment(@Body() dto: CreatePaymentDto) {
    return this.tre.createVendorPayment(dto);
  }

  // Listar saldos abiertos por tercero
  @Get('ar/:thirdPartyId')
  arOpen(@Param('thirdPartyId', ParseIntPipe) id: number) {
    return this.tre.arOpenByThird(id);
  }

  @Get('ap/:thirdPartyId')
  apOpen(@Param('thirdPartyId', ParseIntPipe) id: number) {
    return this.tre.apOpenByThird(id);
  }
}
