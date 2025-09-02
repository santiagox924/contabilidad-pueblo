import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReceiptDto } from './dto/create-receipt.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Injectable()
export class TreasuryService {
  constructor(private prisma: PrismaService) {}

  private num(x: unknown): number {
    if (x == null) return 0;
    if (x instanceof Prisma.Decimal) return x.toNumber();
    const anyX = x as any;
    if (anyX && typeof anyX.toNumber === 'function') return anyX.toNumber();
    const n = Number(anyX);
    return Number.isFinite(n) ? n : 0;
  }

  // Ajusta estos códigos a tu plan de cuentas:
  private ACC = {
    cash: '1105', // Caja/Bancos
    ar:   '1305', // Cuentas por cobrar
    ap:   '2205', // Cuentas por pagar
  };

  private async findAccountByCodeOrThrow(code: string) {
    const acc = await this.prisma.coaAccount.findUnique({ where: { code } });
    if (!acc) throw new BadRequestException(`No existe la cuenta contable ${code}. Ajusta los códigos en TreasuryService.ACC.`);
    return acc;
  }

  // --------- CxC: Recibo de caja (cobro) ----------
  async createReceipt(dto: CreateReceiptDto) {
    if (!dto.allocations?.length) throw new BadRequestException('El recibo requiere asignaciones');

    const tp = await this.prisma.thirdParty.findUnique({ where: { id: dto.thirdPartyId } });
    if (!tp) throw new NotFoundException('Tercero no encontrado');

    // Cargar AR de facturas (deben existir y pertenecer a ese tercero)
    const invIds = [...new Set(dto.allocations.map(a => a.invoiceId))];
    const invoices = await this.prisma.salesInvoice.findMany({ where: { id: { in: invIds } }, include: { ar: true } });
    const invMap = new Map(invoices.map(i => [i.id, i]));

    let total = 0;
    for (const a of dto.allocations) {
      const inv = invMap.get(a.invoiceId);
      if (!inv) throw new BadRequestException(`Factura de venta ${a.invoiceId} no existe`);
      if (inv.thirdPartyId !== dto.thirdPartyId) throw new BadRequestException(`La factura ${a.invoiceId} no pertenece al tercero`);
      if (!inv.ar) throw new BadRequestException(`La factura ${a.invoiceId} no tiene CxC (probablemente fue de contado)`);
      if (this.num(inv.ar.balance) <= 0) throw new BadRequestException(`La factura ${a.invoiceId} ya está saldada`);
      if (a.amount <= 0) throw new BadRequestException('Monto inválido en asignación');
      if (a.amount > this.num(inv.ar.balance)) throw new BadRequestException(`Monto mayor que el saldo de la factura ${a.invoiceId}`);
      total += a.amount;
    }

    // Transacción: crea recibo, asignaciones, aplica a AR y asiento
    const created = await this.prisma.$transaction(async (tx) => {
      const receipt = await tx.cashReceipt.create({
        data: {
          thirdPartyId: dto.thirdPartyId,
          method: dto.method ?? null,
          total,
          note: dto.note ?? null,
          allocations: {
            create: dto.allocations.map(a => ({ invoiceId: a.invoiceId, amount: a.amount })),
          },
        },
        include: { allocations: true },
      });

      // Aplicar a AR
      for (const a of dto.allocations) {
        const ar = await tx.accountsReceivable.findUnique({ where: { invoiceId: a.invoiceId } });
        if (!ar) throw new BadRequestException(`CxC no encontrada para factura ${a.invoiceId}`);
        const newBal = this.num(ar.balance) - a.amount;
        await tx.accountsReceivable.update({
          where: { id: ar.id },
          data: { balance: new Prisma.Decimal(newBal < 0 ? 0 : newBal) },
        });
      }

      // Asiento contable: Dr Caja, Cr CxC (por total)
      const cash = await this.findAccountByCodeOrThrow(this.ACC.cash);
      const ar   = await this.findAccountByCodeOrThrow(this.ACC.ar);

      type JLBase = Omit<Prisma.JournalLineCreateManyInput, 'entryId'>;
      const lines: JLBase[] = [
        { accountId: cash.id, accountCode: cash.code, thirdPartyId: dto.thirdPartyId, debit: total, credit: 0, description: 'Cobro CxC' },
        { accountId: ar.id,   accountCode: ar.code,   thirdPartyId: dto.thirdPartyId, debit: 0,     credit: total, description: 'Aplicación a CxC' },
      ];

      const entry = await tx.journalEntry.create({
        data: { sourceType: 'CASH_RECEIPT', sourceId: receipt.id, description: `Recibo de caja #${receipt.id}` },
      });
      const payload: Prisma.JournalLineCreateManyInput[] = lines.map((l): Prisma.JournalLineCreateManyInput => ({ ...l, entryId: entry.id }));
      await tx.journalLine.createMany({ data: payload });

      return receipt;
    });

    return created;
  }

  // --------- CxP: Pago a proveedor ----------
  async createVendorPayment(dto: CreatePaymentDto) {
    if (!dto.allocations?.length) throw new BadRequestException('El pago requiere asignaciones');

    const tp = await this.prisma.thirdParty.findUnique({ where: { id: dto.thirdPartyId } });
    if (!tp) throw new NotFoundException('Proveedor no encontrado');

    const invIds = [...new Set(dto.allocations.map(a => a.invoiceId))];
    const invoices = await this.prisma.purchaseInvoice.findMany({ where: { id: { in: invIds } }, include: { ap: true } });
    const invMap = new Map(invoices.map(i => [i.id, i]));

    let total = 0;
    for (const a of dto.allocations) {
      const inv = invMap.get(a.invoiceId);
      if (!inv) throw new BadRequestException(`Factura de compra ${a.invoiceId} no existe`);
      if (inv.thirdPartyId !== dto.thirdPartyId) throw new BadRequestException(`La factura ${a.invoiceId} no pertenece al proveedor`);
      if (!inv.ap) throw new BadRequestException(`La factura ${a.invoiceId} no tiene CxP (probablemente fue de contado)`);
      if (this.num(inv.ap.balance) <= 0) throw new BadRequestException(`La factura ${a.invoiceId} ya está saldada`);
      if (a.amount <= 0) throw new BadRequestException('Monto inválido en asignación');
      if (a.amount > this.num(inv.ap.balance)) throw new BadRequestException(`Monto mayor que el saldo de la factura ${a.invoiceId}`);
      total += a.amount;
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.vendorPayment.create({
        data: {
          thirdPartyId: dto.thirdPartyId,
          method: dto.method ?? null,
          total,
          note: dto.note ?? null,
          allocations: {
            create: dto.allocations.map(a => ({ invoiceId: a.invoiceId, amount: a.amount })),
          },
        },
        include: { allocations: true },
      });

      // Aplicar a AP
      for (const a of dto.allocations) {
        const ap = await tx.accountsPayable.findUnique({ where: { invoiceId: a.invoiceId } });
        if (!ap) throw new BadRequestException(`CxP no encontrada para factura ${a.invoiceId}`);
        const newBal = this.num(ap.balance) - a.amount;
        await tx.accountsPayable.update({
          where: { id: ap.id },
          data: { balance: new Prisma.Decimal(newBal < 0 ? 0 : newBal) },
        });
      }

      // Asiento: Dr CxP, Cr Caja
      const cash = await this.findAccountByCodeOrThrow(this.ACC.cash);
      const ap   = await this.findAccountByCodeOrThrow(this.ACC.ap);

      type JLBase = Omit<Prisma.JournalLineCreateManyInput, 'entryId'>;
      const lines: JLBase[] = [
        { accountId: ap.id,   accountCode: ap.code,   thirdPartyId: dto.thirdPartyId, debit: total, credit: 0, description: 'Pago a proveedor (CxP)' },
        { accountId: cash.id, accountCode: cash.code, thirdPartyId: dto.thirdPartyId, debit: 0,     credit: total, description: 'Salida de caja' },
      ];

      const entry = await tx.journalEntry.create({
        data: { sourceType: 'VENDOR_PAYMENT', sourceId: payment.id, description: `Pago a proveedor #${payment.id}` },
      });
      const payload: Prisma.JournalLineCreateManyInput[] = lines.map((l): Prisma.JournalLineCreateManyInput => ({ ...l, entryId: entry.id }));
      await tx.journalLine.createMany({ data: payload });

      return payment;
    });

    return created;
  }

  // Listados rápidos (pendientes)
  arOpenByThird(thirdPartyId: number) {
    return this.prisma.accountsReceivable.findMany({
      where: { thirdPartyId, balance: { gt: 0 } },
      include: { invoice: { select: { id: true, number: true, total: true, issueDate: true } } },
      orderBy: { id: 'asc' },
    });
  }

  apOpenByThird(thirdPartyId: number) {
    return this.prisma.accountsPayable.findMany({
      where: { thirdPartyId, balance: { gt: 0 } },
      include: { invoice: { select: { id: true, number: true, total: true, issueDate: true } } },
      orderBy: { id: 'asc' },
    });
  }
}
