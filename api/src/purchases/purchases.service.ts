import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { Prisma } from '@prisma/client';
import { CreatePurchaseDto } from './dto/create-purchase.dto';

@Injectable()
export class PurchasesService {
  constructor(private prisma: PrismaService, private inv: InventoryService) {}

  private num(x: unknown): number {
    if (x == null) return 0;
    if (x instanceof Prisma.Decimal) return x.toNumber();
    const anyX = x as any;
    if (anyX && typeof anyX.toNumber === 'function') return anyX.toNumber();
    const n = Number(anyX);
    return Number.isFinite(n) ? n : 0;
  }

  // Códigos contables por defecto (ajústalos a tu plan de cuentas)
  private ACC = {
    cash: '1105',            // Caja
    ap: '2205',              // Proveedores (CxP)
    ivaRecoverable: '1355',  // IVA descontable / IVA a favor
    inventory: '1435',       // Inventarios
  };

  async create(dto: CreatePurchaseDto) {
    if (!dto.lines?.length) throw new BadRequestException('La compra requiere líneas');

    const tp = await this.prisma.thirdParty.findUnique({ where: { id: dto.thirdPartyId } });
    if (!tp) throw new NotFoundException('Proveedor no encontrado');

    // Cargar items
    const itemIds = [...new Set(dto.lines.map(l => l.itemId))];
    const items = await this.prisma.item.findMany({ where: { id: { in: itemIds } } });
    const itemMap = new Map(items.map(i => [i.id, i]));

    // Totales
    let subtotal = 0, tax = 0, total = 0;
    for (const l of dto.lines) {
      const item = itemMap.get(l.itemId);
      if (!item) throw new BadRequestException(`Ítem inválido: ${l.itemId}`);
      const base = l.qty * l.unitCost;
      const iva = base * ((l.vatPct ?? item.ivaPct ?? 0) / 100);
      subtotal += base;
      tax += iva;
      total += base + iva;
    }

    // Número incremental
    const nextNumber = (await this.prisma.purchaseInvoice.aggregate({ _max: { number: true } }))._max.number ?? 0;
    const number = nextNumber + 1;

    // 1) Factura de compra + líneas + CxP (si crédito)
    const created = await this.prisma.$transaction(async (tx) => {
      const pi = await tx.purchaseInvoice.create({
        data: {
          number,
          thirdPartyId: dto.thirdPartyId,
          paymentType: dto.paymentType,
          dueDate: dto.paymentType === 'CREDIT' ? (dto.dueDate ? new Date(dto.dueDate) : null) : null,
          subtotal, tax, total,
          note: dto.note ?? null,
          lines: {
            create: dto.lines.map(l => {
              const item = itemMap.get(l.itemId)!;
              const base = l.qty * l.unitCost;
              const iva = base * ((l.vatPct ?? item.ivaPct ?? 0) / 100);
              return {
                itemId: l.itemId,
                qty: l.qty,
                unitCost: l.unitCost,
                vatPct: l.vatPct ?? item.ivaPct ?? 0,
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
        await tx.accountsPayable.create({
          data: { thirdPartyId: dto.thirdPartyId, invoiceId: pi.id, balance: total },
        });
      }

      return pi;
    });

    // 2) Entrada a inventario (FIFO) por líneas de PRODUCTO
    for (const line of created.lines) {
      const item = itemMap.get(line.itemId)!;
      if (item.type === 'SERVICE') continue; // servicios no mueven inventario
      await this.inv.createMove({
        itemId: line.itemId,
        warehouseId: 1,          // TODO parametrizar bodega
        type: 'PURCHASE',
        qty: this.num(line.qty), // positivo
        unitCost: this.num(line.unitCost),
        refType: 'PURCHASE_INVOICE',
        refId: created.id,
        note: `FC-${created.number}`,
      } as any);
    }

    // 3) Asiento contable: Dr Inventario, Dr IVA descontable, Cr Caja/Proveedores
    await this.createJournalForPurchase(created.id, dto.paymentType, subtotal, tax, total, dto.thirdPartyId);

    return created;
  }

  private async findAccountByCodeOrThrow(code: string) {
    const acc = await this.prisma.coaAccount.findUnique({ where: { code } });
    if (!acc) throw new BadRequestException(`No existe la cuenta contable ${code}. Ajusta los códigos en PurchasesService.ACC.`);
    return acc;
  }

  private async createJournalForPurchase(
    invoiceId: number,
    paymentType: 'CASH' | 'CREDIT',
    subtotal: number,
    tax: number,
    total: number,
    thirdPartyId: number,
  ) {
    const cash = await this.findAccountByCodeOrThrow(this.ACC.cash);
    const ap   = await this.findAccountByCodeOrThrow(this.ACC.ap);
    const inv  = await this.findAccountByCodeOrThrow(this.ACC.inventory);
    const ivaR = await this.findAccountByCodeOrThrow(this.ACC.ivaRecoverable);

    type JLBase = Omit<Prisma.JournalLineCreateManyInput, 'entryId'>;
    const lines: JLBase[] = [];

    // Débitos
    if (subtotal > 0) lines.push({ accountId: inv.id,  accountCode: inv.code,  thirdPartyId, debit: subtotal, credit: 0, description: 'Compra inventario' });
    if (tax > 0)      lines.push({ accountId: ivaR.id, accountCode: ivaR.code, thirdPartyId, debit: tax,      credit: 0, description: 'IVA descontable' });

    // Crédito
    if (paymentType === 'CASH') {
      lines.push({ accountId: cash.id, accountCode: cash.code, thirdPartyId, debit: 0, credit: total, description: 'Pago contado' });
    } else {
      lines.push({ accountId: ap.id,   accountCode: ap.code,   thirdPartyId, debit: 0, credit: total, description: 'CxP proveedor' });
    }

    const sumD = lines.reduce<number>((a, l) => a + this.num(l.debit), 0);
    const sumC = lines.reduce<number>((a, l) => a + this.num(l.credit), 0);
    if (Math.abs(sumD - sumC) > 0.000001) {
      throw new BadRequestException(`Asiento descuadrado: D ${sumD} vs C ${sumC}`);
    }

    await this.prisma.$transaction(async (tx) => {
      const entry = await tx.journalEntry.create({
        data: { sourceType: 'PURCHASE_INVOICE', sourceId: invoiceId, description: `Factura de compra #${invoiceId}` },
      });
      const payload: Prisma.JournalLineCreateManyInput[] = lines.map(
        (l): Prisma.JournalLineCreateManyInput => ({ ...l, entryId: entry.id }),
      );
      await tx.journalLine.createMany({ data: payload });
    });
  }

  findOne(id: number) {
    return this.prisma.purchaseInvoice.findUnique({ where: { id }, include: { lines: true, thirdParty: true } });
  }
}
