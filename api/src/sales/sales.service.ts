import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InventoryService } from '../inventory/inventory.service';
import { Prisma } from '@prisma/client';

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
    cash: '1105',           // Caja
    ar: '1305',             // Cuentas por cobrar
    sales: '4135',          // Ingresos por ventas
    ivaPayable: '2408',     // IVA por pagar
    inventory: '1435',      // Inventarios
    cogs: '6135',           // Costo de ventas
  };

  async create(dto: CreateInvoiceDto) {
    if (!dto.lines?.length) throw new BadRequestException('La factura requiere líneas');

    const tp = await this.prisma.thirdParty.findUnique({ where: { id: dto.thirdPartyId } });
    if (!tp) throw new NotFoundException('Tercero no encontrado');

    // Cargar items
    const itemIds = [...new Set(dto.lines.map((l) => l.itemId))];
    const items = await this.prisma.item.findMany({ where: { id: { in: itemIds } } });
    const itemMap = new Map(items.map((i) => [i.id, i]));

    // Validaciones y totales
    let subtotal = 0, tax = 0, total = 0;
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

      // Validar stock en productos
      if (item.type === 'SERVICE') continue;
      // Por ahora usamos bodega 1 (parametrízalo si manejas varias)
      const stock = await this.inv.stockOf(item.id, 1);
      if (stock.qty < l.qty) {
        throw new BadRequestException(
          `Stock insuficiente para SKU ${item.sku} (req ${l.qty}, disp ${stock.qty})`,
        );
      }
    }

    // Número de factura simple (incremental)
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
    //    (refType/refId: enlazamos los movimientos a la factura)
    let cogsTotal = 0;
    for (const line of created.lines) {
      const item = itemMap.get(line.itemId)!;
      if (item.type === 'SERVICE') continue;

      const mv = await this.inv.createMove({
        itemId: line.itemId,
        warehouseId: 1, // TODO: parametrizar bodega
        type: 'SALE',
        qty: this.num(line.qty), // positivo; InventoryService pone signo
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

    // Líneas SIN entryId (se agrega luego); tipadas explícitamente
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

    // Ventas e IVA
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

    // Costo y salida de inventario
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

    // Verifica que descuadre = 0 (tipado para evitar implicit any)
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

      // Payload para createMany tipado correctamente
      const payload: Prisma.JournalLineCreateManyInput[] = lines.map(
        (l): Prisma.JournalLineCreateManyInput => ({
          ...l,
          entryId: entry.id,
        }),
      );

      await tx.journalLine.createMany({ data: payload });
    });
  }

  findOne(id: number) {
    return this.prisma.salesInvoice.findUnique({
      where: { id },
      include: { lines: true, thirdParty: true },
    });
  }
}
