// api/src/treasury/treasury.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, CashMovementKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';
import { CreateCashReceiptDto } from './dto/create-cash-receipt.dto';
import { CreateVendorPaymentDto } from './dto/create-vendor-payment.dto';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { ACCOUNTS } from '../accounting/config/accounts.map';

type FxInput = { currency?: string | null; fxRate?: number | null };
type Amounts = { foreign?: number | null; company: number; fxNote?: string };

@Injectable()
export class TreasuryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
  ) {}

  private async validateAccountCode(
    code: string | null | undefined,
    kind: 'cash' | 'bank',
  ): Promise<string | null> {
    if (!code) return null;
    const trimmed = code.trim();
    if (!trimmed) return null;

    const account = await this.prisma.coaAccount.findUnique({
      where: { code: trimmed },
      select: {
        code: true,
        name: true,
        isDetailed: true,
        isCash: true,
        isBank: true,
        class: true,
        parentCode: true,
      },
    });
    if (!account) {
      throw new BadRequestException(
        `La cuenta contable ${trimmed} no existe en el plan de cuentas`,
      );
    }
    if (account.isDetailed === false) {
      throw new BadRequestException(
        `La cuenta ${trimmed} (${account.name}) no permite movimientos directos. Selecciona una subcuenta detallada.`,
      );
    }
    const accountClass = account.class ?? null;
    const isCashish = account.isCash === true || account.isBank === true;
    if (accountClass && accountClass !== 'ASSET') {
      throw new BadRequestException(
        `La cuenta ${trimmed} (${account.name}) no pertenece a la clase de Activos. Usa una cuenta de disponible (grupo 11).`,
      );
    }
    if (!isCashish) {
      // Permite cuentas sin bandera explícita pero valora ubicación.
      const prefix = trimmed.slice(0, 2);
      if (prefix !== '11') {
        throw new BadRequestException(
          `La cuenta ${trimmed} (${account.name}) no parece ser de disponible. Usa una cuenta del grupo 11 o marca la cuenta como Caja/Banco en el catálogo.`,
        );
      }
    }
    return trimmed;
  }

  // =========================
  // Helpers: FX y conciliación
  // =========================
  private computeAmounts(total: number, fx?: FxInput): Amounts {
    const fxRate = fx?.fxRate && fx.fxRate > 0 ? Number(fx.fxRate) : null;
    const foreign = fxRate ? Number(total) : null;
    const company = fxRate
      ? Number((foreign! * fxRate).toFixed(2))
      : Number(total);
    const fxNote =
      fxRate && fx?.currency
        ? `[FX: ${foreign!.toFixed(2)} ${fx.currency} @ ${fxRate}]`
        : fxRate
          ? `[FX: ${foreign!.toFixed(2)} FGN @ ${fxRate}]`
          : undefined;
    return { foreign, company, fxNote };
  }

  /** Marca las líneas del libro que pegan a la cuenta dada con una huella de conciliación en description */
  private async hintReconcilableLinesByAccountCode(
    entryId: number,
    accountCode: string,
    ref: string,
  ) {
    // Cuando agregues JournalLine.reconciled:boolean, cambia esto por data: { reconciled: false, reconcileRef: ref }
    await this.prisma.journalLine
      .updateMany({
        where: { entryId, accountCode },
        data: {
          description: {
            // preserve descripción si ya existe
            set: Prisma.raw(
              `COALESCE("description",'') || ${this.prisma.$queryRaw`' [RECONCILE: ${ref}]'`}`,
            ) as any,
          } as any,
        },
      })
      .catch(() => void 0);
  }

  // =========================
  // Receipts (cobros a clientes)
  // =========================
  async createReceipt(
    dto: (CreateCashReceiptDto & FxInput) & { userId: number },
  ) {
    if (!dto.allocations?.length) {
      throw new BadRequestException(
        'Debe enviar al menos una asignación (allocation)',
      );
    }
    const date = dto.date ? new Date(dto.date) : new Date();
    const reschedule: 'KEEP' | 'MOVE_NEAREST' =
      (dto as any).reschedule ?? 'KEEP';
    const applyToReceivable =
      dto.applyToReceivable !== undefined ? !!dto.applyToReceivable : true;
    const postAccounting =
      dto.postAccounting !== undefined ? !!dto.postAccounting : true;

    // Validar método de pago si viene
    if (dto.methodId) {
      const pm = await this.prisma.paymentMethod.findUnique({
        where: { id: dto.methodId },
        select: { id: true, active: true },
      });
      if (!pm) throw new NotFoundException('Método de pago no encontrado');
      if (!pm.active)
        throw new BadRequestException('El método de pago está inactivo');
    }

    // FX
    const { company: totalCompany, fxNote } = this.computeAmounts(
      Number(dto.total || 0),
      dto,
    );

    const created = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const receipt = await tx.cashReceipt.create({
          data: {
            thirdPartyId: dto.thirdPartyId,
            date,
            methodId: dto.methodId ?? null,
            total: totalCompany as any, // guardamos en moneda funcional
            note:
              [dto.note?.trim() || null, fxNote].filter(Boolean).join(' ') ||
              null,
          },
        });

        const touchedInvoiceIds = new Set<number>();

        // Crear allocations y actualizar AR/Installments
        for (const a of dto.allocations) {
          if (!a?.invoiceId || a.amount <= 0) continue;
          touchedInvoiceIds.add(a.invoiceId);

          await tx.receiptAllocation.create({
            data: {
              receiptId: receipt.id,
              invoiceId: a.invoiceId,
              amount: a.amount as any,
              installmentId: a.installmentId ?? null,
            },
          });

          // Bajar balance CxC
          if (applyToReceivable) {
            await tx.accountsReceivable.update({
              where: { invoiceId: a.invoiceId },
              data: { balance: { decrement: new Prisma.Decimal(a.amount) } },
            });

            if (a.installmentId) {
              const inst = await tx.installment.update({
                where: { id: a.installmentId },
                data: {
                  paidAmount: { increment: new Prisma.Decimal(a.amount) },
                },
              });
              const paid = new Prisma.Decimal(inst.paidAmount);
              const status = paid.gte(inst.amount)
                ? 'PAID'
                : paid.gt(0)
                  ? 'PARTIALLY_PAID'
                  : 'PENDING';
              await tx.installment.update({
                where: { id: inst.id },
                data: { status: status as any },
              });
            } else {
              await this.allocateAgainstPendingInstallments(
                tx,
                a.invoiceId,
                a.amount,
              );
            }
          }
        }

        // Reprogramar cuotas pendientes si se solicita
        if (
          applyToReceivable &&
          reschedule === 'MOVE_NEAREST' &&
          touchedInvoiceIds.size > 0
        ) {
          for (const invoiceId of touchedInvoiceIds) {
            await this.moveRemainingInstallmentsToNearest(tx, invoiceId, date);
          }
        }

        return tx.cashReceipt.findUnique({
          where: { id: receipt.id },
          include: {
            allocations: true,
            thirdParty: true,
            method: {
              select: {
                id: true,
                name: true,
                bankAccountCode: true,
                cashAccountCode: true,
              } as any,
            },
          },
        });
      },
    );

    // Posteo contable (fuera de la transacción principal)
    const entry = postAccounting
      ? await this.accounting.postCashReceipt(created!.id)
      : null;

    // Marca conciliable en líneas del banco/caja (si el método lo definió)
    const treasuryCode: string | null =
      (created as any)?.method?.bankAccountCode ??
      (created as any)?.method?.cashAccountCode ??
      null;

    if (
      postAccounting &&
      entry &&
      typeof treasuryCode === 'string' &&
      treasuryCode
    ) {
      await this.hintReconcilableLinesByAccountCode(
        entry.id,
        treasuryCode,
        `RC#${created!.id}`,
      );
    }

    // ===== HOOK POS (efectivo): registrar movimiento de caja y ajustar expectedClose =====
    const isCash =
      !!(created as any)?.method?.cashAccountCode ||
      String((created as any)?.method?.name || '')
        .toLowerCase()
        .includes('efectivo');

    if (isCash) {
      const session = await this.prisma.cashSession.findFirst({
        where: {
          userId: dto.userId,
          status: 'OPEN',
          register: { active: true },
        },
        select: { id: true },
      });

      // Política: si quieres forzar sesión abierta, descomenta:
      // if (!session) throw new BadRequestException('No hay sesión de caja abierta para el usuario.')

      if (session) {
        const amountDec = new Prisma.Decimal(
          Number((created as any).total || 0),
        );

        await this.prisma.$transaction([
          this.prisma.cashMovement.create({
            data: {
              sessionId: session.id,
              kind: CashMovementKind.SALE_RECEIPT,
              amount: amountDec,
              refType: 'CashReceipt',
              refId: (created as any).id,
            },
          }),
          this.prisma.cashSession.update({
            where: { id: session.id },
            data: { expectedClose: { increment: amountDec } },
          }),
        ]);
      }
    }
    // ===== FIN HOOK POS =====

    return created!;
  }

  // =========================
  // Payments (pagos a proveedores)
  // =========================
  async createPayment(dto: CreateVendorPaymentDto & FxInput) {
    if (!dto.allocations?.length) {
      throw new BadRequestException(
        'Debe enviar al menos una asignación (allocation)',
      );
    }
    const date = dto.date ? new Date(dto.date) : new Date();

    if (dto.methodId) {
      const pm = await this.prisma.paymentMethod.findUnique({
        where: { id: dto.methodId },
        select: { id: true, active: true },
      });
      if (!pm) throw new NotFoundException('Método de pago no encontrado');
      if (!pm.active)
        throw new BadRequestException('El método de pago está inactivo');
    }

    // FX
    const { company: totalCompany, fxNote } = this.computeAmounts(
      Number(dto.total || 0),
      dto,
    );

    const created = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        // Defensive check: ensure none of the target invoices are purchases
        // already recorded as CASH. Creating a vendor payment for a CASH
        // purchase would produce a duplicate credit to treasury (the
        // purchase posting already credited the cash account).
        const invoiceIds = (dto.allocations || [])
          .filter((a) => a?.invoiceId)
          .map((a) => Number(a.invoiceId));
        let allocationsToApply = (dto.allocations || []).slice();
        const skippedInvoiceIds: number[] = [];
        if (invoiceIds.length) {
          const purchases = await tx.purchaseInvoice.findMany({
            where: { id: { in: invoiceIds } },
            select: { id: true, paymentType: true },
          });
          const cashOnes = purchases.filter((p) => p.paymentType === 'CASH');
          if (cashOnes.length) {
            // Omitir asignaciones a facturas CASH en lugar de fallar para
            // permitir que el frontend cree pagos sin romper cuando el
            // flujo registra la factura como pagada en efectivo.
            const cashIds = new Set(cashOnes.map((p) => p.id));
            allocationsToApply = allocationsToApply.filter(
              (a) => !cashIds.has(Number(a.invoiceId)),
            );
            skippedInvoiceIds.push(...Array.from(cashIds));
          }
        }

        // Si tras filtrar no quedan asignaciones, devolvemos una respuesta
        // informativa y no creamos un vendorPayment (evita creación de pagos
        // inútiles y evita el doble crédito que originó el bug).
        if (!allocationsToApply.length) {
          return {
            ok: true,
            message:
              'No se creó payment: todas las asignaciones referían facturas registradas como CASH',
            skippedInvoiceIds,
          } as any;
        }

        // Reemplazamos dto.allocations temporalmente por allocationsToApply
        // para el resto del flujo y recalculamos totalCompany acorde a las
        // asignaciones que realmente se aplicarán.
        const allocationsSum = allocationsToApply.reduce(
          (s, a) => s + (Number(a.amount) || 0),
          0,
        );
        // Ajustar el total funcional al monto realmente aplicado
        const totalCompanyApplied = allocationsSum;
        const payment = await tx.vendorPayment.create({
          data: {
            thirdPartyId: dto.thirdPartyId,
            date,
            methodId: dto.methodId ?? null,
            total: totalCompanyApplied as any,
            note:
              [dto.note?.trim() || null, fxNote].filter(Boolean).join(' ') ||
              null,
          },
        });

        for (const a of allocationsToApply) {
          if (!a?.invoiceId || a.amount <= 0) continue;

          await tx.paymentAllocation.create({
            data: {
              paymentId: payment.id,
              invoiceId: a.invoiceId,
              amount: a.amount as any,
              installmentId: a.installmentId ?? null,
            },
          });

          await tx.accountsPayable.update({
            where: { invoiceId: a.invoiceId },
            data: { balance: { decrement: new Prisma.Decimal(a.amount) } },
          });

          if (a.installmentId) {
            const inst = await tx.installment.update({
              where: { id: a.installmentId },
              data: { paidAmount: { increment: new Prisma.Decimal(a.amount) } },
            });
            const paid = new Prisma.Decimal(inst.paidAmount);
            const status = paid.gte(inst.amount)
              ? 'PAID'
              : paid.gt(0)
                ? 'PARTIALLY_PAID'
                : 'PENDING';
            await tx.installment.update({
              where: { id: inst.id },
              data: { status: status as any },
            });
          }
        }

        return tx.vendorPayment.findUnique({
          where: { id: payment.id },
          include: {
            allocations: true,
            thirdParty: true,
            method: {
              select: {
                id: true,
                name: true,
                bankAccountCode: true,
                cashAccountCode: true,
              } as any,
            },
          },
        });
      },
    );

    // Si la transacción devolvió un objeto informativo (sin id), significa
    // que no se creó un vendorPayment porque todas las asignaciones eran a
    // facturas CASH: devolvemos esa respuesta tal cual y no intentamos
    // postear asiento de pago.
    if (!created || !created.id) return created;

    const entry = await this.accounting.postVendorPayment(created!.id);

    const treasuryCode: string | null =
      created?.method?.bankAccountCode ??
      created?.method?.cashAccountCode ??
      null;

    if (entry && typeof treasuryCode === 'string' && treasuryCode) {
      await this.hintReconcilableLinesByAccountCode(
        entry.id,
        treasuryCode,
        `VP#${created!.id}`,
      );
    }

    return created!;
  }

  // =========================
  // Transferencia entre bancos (con FX opcional)
  // =========================
  async createBankTransfer(dto: CreateTransferDto & FxInput) {
    const amount = Number(dto.amount);
    if (!amount || amount <= 0) {
      throw new BadRequestException('El monto debe ser mayor que cero');
    }
    const fromCode = (dto.fromAccountCode ?? '').trim();
    const toCode = (dto.toAccountCode ?? '').trim();
    if (!fromCode || !toCode) {
      throw new BadRequestException('Debe indicar cuenta origen y destino');
    }
    if (fromCode === toCode) {
      throw new BadRequestException(
        'La cuenta origen y destino no pueden ser la misma',
      );
    }

    const [fromAcc, toAcc] = await this.prisma.$transaction([
      this.prisma.coaAccount.findUnique({ where: { code: fromCode } }),
      this.prisma.coaAccount.findUnique({ where: { code: toCode } }),
    ]);

    if (!fromAcc)
      throw new NotFoundException(`Cuenta origen ${fromCode} no existe`);
    if (!toAcc)
      throw new NotFoundException(`Cuenta destino ${toCode} no existe`);
    if (!fromAcc.isBank)
      throw new BadRequestException(
        `La cuenta origen ${fromCode} no es bancaria`,
      );
    if (!toAcc.isBank)
      throw new BadRequestException(
        `La cuenta destino ${toCode} no es bancaria`,
      );
    if (fromAcc.reconcilable === false)
      throw new BadRequestException(
        `La cuenta origen ${fromCode} debe ser conciliable`,
      );
    if (toAcc.reconcilable === false)
      throw new BadRequestException(
        `La cuenta destino ${toCode} debe ser conciliable`,
      );

    const date = dto.date ? new Date(dto.date) : new Date();
    const memo = (dto.memo ?? '').trim();

    // FX: monto funcional (si viene fxRate aplicamos)
    const { company: companyAmt, fxNote } = this.computeAmounts(amount, dto);

    // Armamos líneas base (funcional)
    const lines = [
      {
        accountCode: toAcc.code,
        debit: companyAmt,
        credit: 0,
        description: 'Entrada banco destino',
      },
      {
        accountCode: fromAcc.code,
        debit: 0,
        credit: companyAmt,
        description: 'Salida banco origen',
      },
    ];

    // Si hay diferencia por FX (escenario edge: companyDebit != companyCredit)
    const sumD = lines.reduce((a, l) => a + (l.debit || 0), 0);
    const sumC = lines.reduce((a, l) => a + (l.credit || 0), 0);
    const diff = Math.round((sumD - sumC) * 100) / 100;
    if (diff !== 0) {
      if (diff > 0) {
        // falta crédito → ganancia cambiaria (Cr)
        const fxGain = (ACCOUNTS as any).fxGain as string | undefined;
        if (!fxGain)
          throw new BadRequestException(
            'Configura ACCOUNTS.fxGain para diferencias cambiarias',
          );
        lines.push({
          accountCode: fxGain,
          debit: 0,
          credit: Math.abs(diff),
          description: 'Ajuste FX transferencia',
        });
      } else {
        // falta débito → pérdida cambiaria (Dr)
        const fxLoss = (ACCOUNTS as any).fxLoss as string | undefined;
        if (!fxLoss)
          throw new BadRequestException(
            'Configura ACCOUNTS.fxLoss para diferencias cambiarias',
          );
        lines.push({
          accountCode: fxLoss,
          debit: Math.abs(diff),
          credit: 0,
          description: 'Ajuste FX transferencia',
        });
      }
    }

    // Creamos DRAFT y luego posteamos para numerar
    const entryDraft = await this.accounting.createManualEntry({
      date,
      description: [
        memo || `Transferencia ${fromAcc.code} → ${toAcc.code}`,
        fxNote,
      ]
        .filter(Boolean)
        .join(' '),
      sourceType: 'BANK_TRANSFER',
      sourceId: Math.round(Date.now() / 1000), // id sintético para idempotencia local
      lines,
    } as any);

    if (!entryDraft)
      throw new BadRequestException('No se pudo crear el borrador de asiento');

    const entry = await this.accounting.postManualEntry(entryDraft.id);
    if (!entry) throw new BadRequestException('No se pudo postear el asiento');

    // marcas conciliables en ambas cuentas
    await this.hintReconcilableLinesByAccountCode(
      entry.id,
      toAcc.code,
      `TRF#${entry.id}-IN`,
    );
    await this.hintReconcilableLinesByAccountCode(
      entry.id,
      fromAcc.code,
      `TRF#${entry.id}-OUT`,
    );

    return { ok: true, entry };
  }

  // =========================
  // Catálogo: Métodos de pago
  // =========================
  async createPaymentMethod(dto: CreatePaymentMethodDto) {
    const name = (dto.name ?? '').trim();
    if (!name)
      throw new BadRequestException('El nombre del método es obligatorio');

    const exists = await this.prisma.paymentMethod.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (exists)
      throw new BadRequestException(
        'Ya existe un método de pago con ese nombre',
      );

    const cashAccountCode = await this.validateAccountCode(
      dto.cashAccountCode,
      'cash',
    );
    const bankAccountCode = await this.validateAccountCode(
      dto.bankAccountCode,
      'bank',
    );

    if (!cashAccountCode && !bankAccountCode) {
      throw new BadRequestException(
        'Configura al menos una cuenta contable (Caja o Banco) para el método de pago.',
      );
    }

    const method = await this.prisma.paymentMethod.create({
      data: {
        name,
        accountName: dto.accountName?.trim() || null,
        accountNumber: dto.accountNumber?.trim() || null,
        active: dto.active ?? true,
        cashAccountCode,
        bankAccountCode,
      },
      select: {
        id: true,
        name: true,
        active: true,
        accountName: true,
        accountNumber: true,
        cashAccountCode: true,
        bankAccountCode: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return method;
  }

  async listPaymentMethods(activeOnly = true) {
    return this.prisma.paymentMethod.findMany({
      where: activeOnly ? { active: true } : undefined,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        active: true,
        accountName: true,
        accountNumber: true,
        cashAccountCode: true,
        bankAccountCode: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getPaymentMethod(id: number) {
    const pm = await this.prisma.paymentMethod.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        active: true,
        accountName: true,
        accountNumber: true,
        cashAccountCode: true,
        bankAccountCode: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!pm) throw new NotFoundException('Método de pago no encontrado');
    return pm;
  }

  async updatePaymentMethod(id: number, dto: UpdatePaymentMethodDto) {
    const current = await this.prisma.paymentMethod.findUnique({
      where: { id },
    });
    if (!current) throw new NotFoundException('Método de pago no encontrado');

    if (dto.name) {
      const exists = await this.prisma.paymentMethod.findFirst({
        where: {
          id: { not: id },
          name: { equals: dto.name.trim(), mode: 'insensitive' },
        },
        select: { id: true },
      });
      if (exists)
        throw new BadRequestException(
          'Ya existe un método de pago con ese nombre',
        );
    }

    const cashAccountCode =
      dto.cashAccountCode !== undefined
        ? await this.validateAccountCode(dto.cashAccountCode, 'cash')
        : undefined;
    const bankAccountCode =
      dto.bankAccountCode !== undefined
        ? await this.validateAccountCode(dto.bankAccountCode, 'bank')
        : undefined;

    if (
      (cashAccountCode ?? current.cashAccountCode) == null &&
      (bankAccountCode ?? current.bankAccountCode) == null
    ) {
      throw new BadRequestException(
        'El método debe conservar al menos una cuenta contable (Caja o Banco).',
      );
    }

    return this.prisma.paymentMethod.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        accountName: dto.accountName?.trim(),
        accountNumber: dto.accountNumber?.trim(),
        active: typeof dto.active === 'boolean' ? dto.active : undefined,
        cashAccountCode,
        bankAccountCode,
      },
      select: {
        id: true,
        name: true,
        active: true,
        accountName: true,
        accountNumber: true,
        cashAccountCode: true,
        bankAccountCode: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async deletePaymentMethod(id: number) {
    const pm = await this.prisma.paymentMethod.findUnique({ where: { id } });
    if (!pm) throw new NotFoundException('Método de pago no encontrado');

    const [rc, vp] = await Promise.all([
      this.prisma.cashReceipt.count({ where: { methodId: id } }),
      this.prisma.vendorPayment.count({ where: { methodId: id } }),
    ]);
    if (rc + vp > 0) {
      throw new BadRequestException(
        'No se puede eliminar: el método tiene movimientos. Inactívalo en su lugar.',
      );
    }

    await this.prisma.paymentMethod.delete({ where: { id } });
    return { ok: true };
  }

  // =========================
  // Saldos por método (usa libro diario)
  // =========================
  async getPaymentMethodBalance(id: number, from?: string, to?: string) {
    const pm = await this.prisma.paymentMethod.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        bankAccountCode: true,
        cashAccountCode: true,
        active: true,
      } as any,
    });
    if (!pm) throw new NotFoundException('Método de pago no encontrado');

    const accountCode =
      (pm as any).bankAccountCode ?? (pm as any).cashAccountCode ?? null;
    if (!accountCode) {
      throw new BadRequestException(
        'El método de pago no tiene cuenta contable asignada (bankAccountCode/cashAccountCode).',
      );
    }

    const range = this.parseRange(from, to);

    const lines = await this.prisma.journalLine.findMany({
      where: {
        accountCode,
        entry: { date: { gte: range.gte, lte: range.lte } },
      },
      select: { debit: true, credit: true },
    });

    const D = (x: any) =>
      x instanceof Prisma.Decimal
        ? x.toNumber()
        : typeof x === 'number'
          ? x
          : Number(x || 0);

    const debit = lines.reduce((a, l) => a + D(l.debit), 0);
    const credit = lines.reduce((a, l) => a + D(l.credit), 0);
    const balance = debit - credit; // naturaleza Débito

    return {
      methodId: pm.id,
      methodName: pm.name,
      accountCode,
      from: range.gte.toISOString().slice(0, 10),
      to: range.lte.toISOString().slice(0, 10),
      debit,
      credit,
      balance,
    };
  }

  // -------------------------
  // Internos: cuotas y fechas
  // -------------------------
  private async allocateAgainstPendingInstallments(
    tx: Prisma.TransactionClient,
    invoiceId: number,
    amount: number,
  ) {
    if (!amount || amount <= 0) return;

    const ar = await tx.accountsReceivable.findUnique({
      where: { invoiceId },
      select: { id: true },
    });
    if (!ar) return;

    let remaining = new Prisma.Decimal(amount);
    const installments = await tx.installment.findMany({
      where: {
        receivableId: ar.id,
        status: { in: ['PENDING', 'PARTIALLY_PAID'] as any },
      },
      orderBy: [{ dueDate: 'asc' }, { number: 'asc' }],
    });

    for (const inst of installments) {
      if (remaining.lte(0)) break;
      const pending = new Prisma.Decimal(inst.amount).minus(inst.paidAmount);
      if (pending.lte(0)) continue;
      const pay = remaining.lt(pending) ? remaining : pending;
      await tx.installment.update({
        where: { id: inst.id },
        data: {
          paidAmount: { increment: pay },
          status: pay.eq(pending) ? ('PAID' as any) : ('PARTIALLY_PAID' as any),
        },
      });
      remaining = remaining.minus(pay);
    }
  }

  private async moveRemainingInstallmentsToNearest(
    tx: Prisma.TransactionClient,
    invoiceId: number,
    anchorDate: Date,
  ) {
    const invoice = await tx.salesInvoice.findUnique({
      where: { id: invoiceId },
      include: { ar: { include: { installments: true } } },
    });
    if (!invoice?.ar) return;

    const freq = (invoice as any).installmentFrequency ?? 'MONTHLY';
    const notPaid = ((invoice.ar.installments ?? []) as any[])
      .filter((i: any) => i.status !== 'PAID')
      .sort((a: any, b: any) => a.number - b.number);
    if (notPaid.length === 0) return;

    const firstUnpaid = notPaid[0];
    const firstDue = new Date(firstUnpaid.dueDate);

    let firstNewDue: Date;
    if (freq === 'BIWEEKLY') {
      const candidate = new Date(firstDue);
      while (candidate.getTime() <= anchorDate.getTime()) {
        candidate.setDate(candidate.getDate() + 14);
      }
      firstNewDue = candidate;
    } else {
      const baseDay = firstDue.getDate();
      const y = anchorDate.getFullYear();
      const m = anchorDate.getMonth();
      const todayDay = anchorDate.getDate();
      const candidate = new Date(y, m, baseDay);
      firstNewDue =
        todayDay < baseDay ? candidate : new Date(y, m + 1, baseDay);
    }

    for (let idx = 0; idx < notPaid.length; idx++) {
      const inst = notPaid[idx];
      const newDue = this.addStep(
        firstNewDue,
        idx,
        freq as 'MONTHLY' | 'BIWEEKLY',
      );
      await tx.installment.update({
        where: { id: inst.id },
        data: { dueDate: newDue },
      });
    }
  }

  private addStep(
    base: Date,
    idx: number,
    freq: 'MONTHLY' | 'BIWEEKLY' | string,
  ) {
    const d = new Date(base);
    if (idx === 0) return d;
    if (freq === 'BIWEEKLY') d.setDate(d.getDate() + 14 * idx);
    else d.setMonth(d.getMonth() + idx);
    return d;
  }

  // Rango fechas utilitario
  private parseRange(from?: string, to?: string) {
    const min = new Date('1900-01-01T00:00:00.000Z');
    const max = new Date('2999-12-31T23:59:59.999Z');
    const gte = from ? new Date(from) : min;
    let lte = to ? new Date(to) : max;
    if (to && to.length <= 10) lte = new Date(`${to}T23:59:59.999Z`);
    return { gte, lte };
  }
}
