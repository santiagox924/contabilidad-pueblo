import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreateCreditNoteDto } from './dto/create-credit-note.dto';

@Injectable()
export class SalesService {
  constructor(private prisma: PrismaService, private inv: InventoryService) {}

  // Helper numérico seguro (Decimal | number | string)
  private num(x: unknown): number {
    if (x == null) return 0;
    if (x instanceof Prisma.Decimal) return x.toNumber();
    const anyX = x as any;
    if (anyX && typeof anyX.toNumber === 'function') return anyX.toNumber();
    const n = Number(anyX);
    return Number.isFinite(n) ? n : 0;
  }

  // Códigos por defecto (ajústalos a tu plan de cuentas)
  private ACC = {
    cash: '1105',         // Caja/Bancos
    ar: '1305',           // Cuentas por cobrar
    sales: '4135',        // Ingresos por ventas
    salesReturns: '4175', // Devoluciones en ventas (contraingresos)
    ivaPayable: '2408',   // IVA por pagar
    inventory: '1435',    // Inventarios
    cogs: '6135',         // Costo de ventas
  };

  /* =========================
     Crear factura de venta
     ========================= */
  async create(dto: CreateInvoiceDto) {
    if (!dto.lines?.length) throw new BadRequestException('La factura requiere líneas');

    const tp = await this.prisma.thirdParty.findUnique({ where: { id: dto.thirdPartyId } });
    if (!tp) throw new NotFoundException('Tercero no encontrado');

    // Cargar items
    const itemIds = [...new Set(dto.lines.map((l) => l.itemId))];
    const items = await this.prisma.item.findMany({ where: { id: { in: itemIds } } });
    const itemMap = new Map(items.map((i) => [i.id, i]));

    // Validaciones y totales
    let subtotal = 0,
      tax = 0,
      total = 0;
    for (const l of dto.lines) {
      const item = itemMap.get(l.itemId);
      if (!item || !item.active) throw new BadRequestException(`Ítem inválido: ${l.itemId}`);

      const d = (l.discountPct ?? 0) / 100;
      const base = l.qty * l.unitPrice * (1 - d);
      const vatPct = (l.vatPct ?? item.ivaPct ?? 0) / 100;
      const iva = base * vatPct;

      subtotal += base;
      tax += iva;
      total += base + iva;

      // Validar stock si es PRODUCTO (bodega 1 por defecto)
      if (item.type === 'SERVICE') continue;
      const stock = await this.inv.stockOf(item.id, 1);
      if (stock.qty < l.qty) {
        throw new BadRequestException(
          `Stock insuficiente para SKU ${item.sku} (req ${l.qty}, disp ${stock.qty})`,
        );
      }
    }

    // Numeración incremental
    const nextNumber =
      (await this.prisma.salesInvoice.aggregate({ _max: { number: true } }))._max.number ?? 0;
    const number = nextNumber + 1;

    // 1) Crear factura + líneas (TX)
    const created = await this.prisma.$transaction(async (tx) => {
      const inv = await tx.salesInvoice.create({
        data: {
          number,
          thirdPartyId: dto.thirdPartyId,
          paymentType: dto.paymentType,
          dueDate:
            dto.paymentType === 'CREDIT'
              ? dto.dueDate
                ? new Date(dto.dueDate)
                : null
              : null,
          subtotal,
          tax,
          total,
          note: dto.note ?? null,
          lines: {
            create: dto.lines.map((l) => {
              const item = itemMap.get(l.itemId)!;
              const d = (l.discountPct ?? 0) / 100;
              const base = l.qty * l.unitPrice * (1 - d);
              const vatPct = (l.vatPct ?? item.ivaPct ?? 0) / 100;
              const iva = base * vatPct;
              return {
                itemId: l.itemId,
                qty: l.qty,
                unitPrice: l.unitPrice,
                discountPct: l.discountPct ?? 0,
                vatPct: Math.round(vatPct * 100),
                lineSubtotal: base,
                lineVat: iva,
                lineTotal: base + iva,
              };
            }),
          },
        },
        include: { lines: true },
      });

      if (dto.paymentType === 'CREDIT') {
        await tx.accountsReceivable.create({
          data: { thirdPartyId: dto.thirdPartyId, invoiceId: inv.id, balance: total },
        });
      }

      return inv;
    });

    // 2) Movimientos de inventario (FIFO) por líneas de producto
    let cogsTotal = 0;
    for (const line of created.lines) {
      const item = itemMap.get(line.itemId)!;
      if (item.type === 'SERVICE') continue;

      const mv = await this.inv.createMove({
        itemId: line.itemId,
        warehouseId: 1, // TODO: parametrizar bodega
        type: 'SALE',
        qty: this.num(line.qty), // positivo; InventoryService pone signo correcto
        // unitCost ignorado en salidas (lo calcula FIFO)
        refType: 'SALES_INVOICE',
        refId: created.id,
        note: `FV-${created.number}`,
      } as any);

      const mvCost = Math.abs(this.num(mv.qty)) * this.num(mv.unitCost);
      cogsTotal += mvCost;
    }

    // 3) Asiento contable (doble partida)
    await this.createJournalForInvoice(
      created.id,
      dto.paymentType,
      subtotal,
      tax,
      total,
      cogsTotal,
      dto.thirdPartyId,
    );

    return { ...created, cogsTotal };
  }

  private async findAccountByCodeOrThrow(code: string) {
    const acc = await this.prisma.coaAccount.findUnique({ where: { code } });
    if (!acc) {
      throw new BadRequestException(
        `No existe la cuenta contable ${code}. Ajusta los códigos en SalesService.ACC.`,
      );
    }
    return acc;
  }

  private async createJournalForInvoice(
    invoiceId: number,
    paymentType: 'CASH' | 'CREDIT',
    subtotal: number,
    tax: number,
    total: number,
    cogs: number,
    thirdPartyId: number,
  ) {
    const cash = await this.findAccountByCodeOrThrow(this.ACC.cash);
    const ar = await this.findAccountByCodeOrThrow(this.ACC.ar);
    const sales = await this.findAccountByCodeOrThrow(this.ACC.sales);
    const ivaPay = await this.findAccountByCodeOrThrow(this.ACC.ivaPayable);
    const inv = await this.findAccountByCodeOrThrow(this.ACC.inventory);
    const cogsAcc = await this.findAccountByCodeOrThrow(this.ACC.cogs);

    type JLBase = Omit<Prisma.JournalLineCreateManyInput, 'entryId'>;
    const lines: JLBase[] = [];

    if (paymentType === 'CASH') {
      lines.push({
        accountId: cash.id,
        accountCode: cash.code,
        thirdPartyId,
        debit: total,
        credit: 0,
        description: 'Cobro contado',
      });
    } else {
      lines.push({
        accountId: ar.id,
        accountCode: ar.code,
        thirdPartyId,
        debit: total,
        credit: 0,
        description: 'Factura a crédito',
      });
    }

    if (subtotal > 0) {
      lines.push({
        accountId: sales.id,
        accountCode: sales.code,
        thirdPartyId,
        debit: 0,
        credit: subtotal,
        description: 'Ingreso por ventas',
      });
    }
    if (tax > 0) {
      lines.push({
        accountId: ivaPay.id,
        accountCode: ivaPay.code,
        thirdPartyId,
        debit: 0,
        credit: tax,
        description: 'IVA por pagar',
      });
    }

    if (cogs > 0) {
      lines.push({
        accountId: cogsAcc.id,
        accountCode: cogsAcc.code,
        thirdPartyId,
        debit: cogs,
        credit: 0,
        description: 'Costo de ventas',
      });
      lines.push({
        accountId: inv.id,
        accountCode: inv.code,
        thirdPartyId,
        debit: 0,
        credit: cogs,
        description: 'Salida inventario',
      });
    }

    const sumD = lines.reduce<number>((a, l) => a + this.num(l.debit), 0);
    const sumC = lines.reduce<number>((a, l) => a + this.num(l.credit), 0);
    const diff = Math.abs(sumD - sumC);
    if (diff > 0.000001) {
      throw new BadRequestException(`Asiento descuadrado: D ${sumD} vs C ${sumC}`);
    }

    await this.prisma.$transaction(async (tx) => {
      const entry = await tx.journalEntry.create({
        data: {
          sourceType: 'SALES_INVOICE',
          sourceId: invoiceId,
          description: `Factura de venta #${invoiceId}`,
        },
      });

      const payload: Prisma.JournalLineCreateManyInput[] = lines.map((l) => ({
        ...l,
        entryId: entry.id,
      }));

      await tx.journalLine.createMany({ data: payload });
    });
  }

  /* =========================
     Nota Crédito de ventas
     ========================= */
  async createCreditNote(dto: CreateCreditNoteDto) {
    if (!dto.lines?.length) throw new BadRequestException('La nota crédito requiere líneas');

    // 1) Factura origen
    const inv = await this.prisma.salesInvoice.findUnique({
      where: { id: dto.invoiceId },
      include: { lines: true, thirdParty: true, ar: true },
    });
    if (!inv) throw new NotFoundException('Factura origen no encontrada');
    if (inv.status === 'VOID') throw new BadRequestException('La factura está anulada');

    // 2) Items
    const itemIds = [...new Set(dto.lines.map((l) => l.itemId))];
    const items = await this.prisma.item.findMany({ where: { id: { in: itemIds } } });
    const itemMap = new Map(items.map((i) => [i.id, i]));

    // 3) Totales
    let subtotal = 0,
      tax = 0,
      total = 0;
    for (const l of dto.lines) {
      const it = itemMap.get(l.itemId);
      if (!it || !it.active) throw new BadRequestException(`Ítem inválido: ${l.itemId}`);
      if (l.qty <= 0) throw new BadRequestException('Cantidad debe ser positiva');

      const base = l.qty * l.unitPrice;
      const vatPct = (l.vatPct ?? it.ivaPct ?? 0) / 100;
      const iva = base * vatPct;

      subtotal += base;
      tax += iva;
      total += base + iva;
    }

    // 4) Si fue crédito, no exceder saldo CxC
    if (inv.paymentType === 'CREDIT' && inv.ar) {
      const ar = await this.prisma.accountsReceivable.findUnique({ where: { id: inv.ar.id } });
      const bal = this.num(ar?.balance);
      if (total > bal + 1e-6) {
        throw new BadRequestException(`La nota crédito (${total}) excede el saldo del cliente (${bal}).`);
      }
    }

    // 5) Numeración
    const nextCN =
      (await this.prisma.salesCreditNote.aggregate({ _max: { number: true } }))._max.number ?? 0;
    const number = nextCN + 1;

    // 6) Crear NC + líneas (TX) y bajar CxC si aplica
    const created = await this.prisma.$transaction(async (tx) => {
      const cn = await tx.salesCreditNote.create({
        data: {
          number,
          invoiceId: inv.id,
          thirdPartyId: inv.thirdPartyId,
          reason: dto.reason ?? null,
          subtotal,
          tax,
          total,
          lines: {
            create: dto.lines.map((l) => {
              const it = itemMap.get(l.itemId)!;
              const vatPctInt = l.vatPct ?? it.ivaPct ?? 0;
              const base = l.qty * l.unitPrice;
              const iva = base * (vatPctInt / 100);
              return {
                itemId: l.itemId,
                qty: l.qty,
                unitPrice: l.unitPrice,
                vatPct: vatPctInt,
                lineSubtotal: base,
                lineVat: iva,
                lineTotal: base + iva,
              };
            }),
          },
        },
        include: { lines: true },
      });

      if (inv.paymentType === 'CREDIT' && inv.ar) {
        const bal = this.num(inv.ar.balance);
        const newBal = Math.max(0, bal - total);
        await tx.accountsReceivable.update({
          where: { id: inv.ar.id },
          data: { balance: new Prisma.Decimal(newBal) },
        });
      }

      return cn;
    });

    // 7) Reingreso inventario (PRODUCT) a costo promedio
    let cogsReversalTotal = 0;
    for (const line of created.lines) {
      const item = itemMap.get(line.itemId)!;
      if (item.type === 'SERVICE') continue;

      const costAvg = this.num(item.costAvg) || 0;
      await this.inv.createMove({
        itemId: line.itemId,
        warehouseId: 1,
        type: 'ADJUSTMENT', // entrada
        qty: this.num(line.qty),
        unitCost: costAvg,
        refType: 'SALES_CREDIT_NOTE',
        refId: created.id,
        note: `NC-${created.number} dev`,
      } as any);

      cogsReversalTotal += this.num(line.qty) * costAvg;
    }

    // 8) Asiento contable de la NC
    await this.createJournalForCreditNote(
      created.id,
      inv.paymentType,
      subtotal,
      tax,
      total,
      cogsReversalTotal,
      inv.thirdPartyId,
    );

    return created;
  }

  private async createJournalForCreditNote(
    creditNoteId: number,
    paymentType: 'CASH' | 'CREDIT',
    subtotal: number,
    tax: number,
    total: number,
    cogsReverse: number,
    thirdPartyId: number,
  ) {
    const cash = await this.findAccountByCodeOrThrow(this.ACC.cash);
    const ar = await this.findAccountByCodeOrThrow(this.ACC.ar);
    const salesRet = await this.findAccountByCodeOrThrow(this.ACC.salesReturns);
    const ivaPay = await this.findAccountByCodeOrThrow(this.ACC.ivaPayable);
    const invAcc = await this.findAccountByCodeOrThrow(this.ACC.inventory);
    const cogsAcc = await this.findAccountByCodeOrThrow(this.ACC.cogs);

    type JLBase = Omit<Prisma.JournalLineCreateManyInput, 'entryId'>;
    const lines: JLBase[] = [];

    // Reverso de ingresos e IVA
    if (subtotal > 0) {
      lines.push({
        accountId: salesRet.id,
        accountCode: salesRet.code,
        thirdPartyId,
        debit: subtotal,
        credit: 0,
        description: 'NC - Devolución',
      });
    }
    if (tax > 0) {
      lines.push({
        accountId: ivaPay.id,
        accountCode: ivaPay.code,
        thirdPartyId,
        debit: tax,
        credit: 0,
        description: 'NC - IVA',
      });
    }

    // Contrapartida: CxC o Caja
    if (paymentType === 'CREDIT') {
      lines.push({
        accountId: ar.id,
        accountCode: ar.code,
        thirdPartyId,
        debit: 0,
        credit: total,
        description: 'NC - reduce CxC',
      });
    } else {
      lines.push({
        accountId: cash.id,
        accountCode: cash.code,
        thirdPartyId,
        debit: 0,
        credit: total,
        description: 'NC - salida de caja',
      });
    }

    // Reversa del costo e inventario
    if (cogsReverse > 0) {
      lines.push({
        accountId: invAcc.id,
        accountCode: invAcc.code,
        thirdPartyId,
        debit: cogsReverse,
        credit: 0,
        description: 'NC - reingreso inventario',
      });
      lines.push({
        accountId: cogsAcc.id,
        accountCode: cogsAcc.code,
        thirdPartyId,
        debit: 0,
        credit: cogsReverse,
        description: 'NC - reversa costo',
      });
    }

    const sumD = lines.reduce<number>((a, l) => a + this.num(l.debit), 0);
    const sumC = lines.reduce<number>((a, l) => a + this.num(l.credit), 0);
    if (Math.abs(sumD - sumC) > 1e-6) {
      throw new BadRequestException(`Asiento NC descuadrado D ${sumD} vs C ${sumC}`);
    }

    await this.prisma.$transaction(async (tx) => {
      const entry = await tx.journalEntry.create({
        data: {
          sourceType: 'SALES_CREDIT_NOTE',
          sourceId: creditNoteId,
          description: `NC #${creditNoteId}`,
        },
      });

      const payload: Prisma.JournalLineCreateManyInput[] = lines.map((l) => ({
        ...l,
        entryId: entry.id,
      }));

      await tx.journalLine.createMany({ data: payload });
    });
  }

  /* =========================
     Anulación (VOID) de factura
     ========================= */
  async voidInvoice(id: number) {
    const inv = await this.prisma.salesInvoice.findUnique({
      where: { id },
      include: { lines: true, thirdParty: true, ar: true },
    });
    if (!inv) throw new NotFoundException('Factura no encontrada');
    if (inv.status === 'VOID') throw new BadRequestException('La factura ya está anulada');

    // Verifica cobros aplicados
    const allocs = await this.prisma.receiptAllocation.findMany({
      where: { invoiceId: id },
      select: { amount: true },
    });
    const applied = allocs.reduce((a, r) => a + this.num(r.amount), 0);
    if (applied > 0) {
      throw new BadRequestException('No se puede anular: la factura tiene cobros aplicados');
    }

    // Reponer inventario por líneas de PRODUCTO (fuera de la TX principal)
    for (const line of inv.lines) {
      const item = await this.prisma.item.findUnique({ where: { id: line.itemId } });
      if (!item) continue;
      if (item.type === 'SERVICE') continue;

      const costAvg = this.num(item.costAvg) || 0;
      await this.inv.createMove({
        itemId: line.itemId,
        warehouseId: 1,
        type: 'ADJUSTMENT',
        qty: this.num(line.qty),
        unitCost: costAvg,
        refType: 'VOID_SALES_INVOICE',
        refId: inv.id,
        note: `Anulación FV-${inv.number}`,
      } as any);
    }

    // TX: CxC a 0 (si aplica), asiento de reversa y marcar VOID
    return await this.prisma.$transaction(async (tx) => {
      if (inv.ar) {
        await tx.accountsReceivable.update({
          where: { id: inv.ar.id },
          data: { balance: new Prisma.Decimal(0) },
        });
      }

      // Reversa contable: invierte Débitos/Créditos del asiento original
      const entryOrig = await tx.journalEntry.findFirst({
        where: { sourceType: 'SALES_INVOICE', sourceId: inv.id },
        include: { lines: true },
        orderBy: { id: 'asc' },
      });

      if (entryOrig && entryOrig.lines.length > 0) {
        const entryRev = await tx.journalEntry.create({
          data: {
            sourceType: 'VOID_SALES_INVOICE',
            sourceId: inv.id,
            description: `Reversa FV-${inv.number}`,
          },
        });

        const revLines: Prisma.JournalLineCreateManyInput[] = entryOrig.lines.map((l) => ({
          entryId: entryRev.id,
          accountId: l.accountId,
          accountCode: l.accountCode,
          thirdPartyId: l.thirdPartyId,
          debit: l.credit,
          credit: l.debit,
          description: `REV: ${l.description ?? ''}`.trim(),
        }));

        await tx.journalLine.createMany({ data: revLines });
      }

      const updated = await tx.salesInvoice.update({
        where: { id: inv.id },
        data: { status: 'VOID' },
        include: { lines: true, thirdParty: true, ar: true },
      });

      return updated;
    });
  }

  /* =========================
     Consultas
     ========================= */
  findOne(id: number) {
    return this.prisma.salesInvoice.findUnique({
      where: { id },
      include: { lines: true, thirdParty: true },
    });
  }

  // 👉 NUEVO: para que el controller pueda usarlo en GET /sales/credit-notes/:id
  getCreditNote(id: number) {
    return this.prisma.salesCreditNote.findUnique({
      where: { id },
      include: { lines: true, thirdParty: true, invoice: true },
    });
  }
}
