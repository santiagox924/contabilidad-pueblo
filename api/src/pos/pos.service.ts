import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, CashMovementKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PosService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- REGISTROS (Cajas) ----------
  listRegisters() {
    return this.prisma.cashRegister.findMany({
      where: { active: true },
      orderBy: { id: 'asc' },
    });
  }

  async createRegister(dto: { name: string; location?: string }) {
    return this.prisma.cashRegister.create({ data: dto });
  }

  // ---------- SESIONES ----------
  async getActiveSession(params: { registerId: number; userId: number }) {
    const { registerId, userId } = params;
    return this.prisma.cashSession.findFirst({
      where: { registerId, userId, status: 'OPEN' },
      include: { movements: true, counts: true, register: true, user: true },
    });
  }

  async openSession(dto: {
    registerId: number;
    userId: number;
    openingAmount: number;
    note?: string;
  }) {
    // Verifica caja y usuario
    const [register, existing] = await this.prisma.$transaction([
      this.prisma.cashRegister.findUnique({ where: { id: dto.registerId } }),
      this.prisma.cashSession.findFirst({
        where: {
          registerId: dto.registerId,
          userId: dto.userId,
          status: 'OPEN',
        },
      }),
    ]);

    if (!register || !register.active) {
      throw new NotFoundException('Caja no encontrada o inactiva.');
    }
    if (existing) {
      throw new BadRequestException(
        'Ya existe una sesión abierta para este usuario en esta caja.',
      );
    }

    return this.prisma.cashSession.create({
      data: {
        registerId: dto.registerId,
        userId: dto.userId,
        openingAmount: new Prisma.Decimal(dto.openingAmount),
        expectedClose: new Prisma.Decimal(dto.openingAmount),
        note: dto.note,
        status: 'OPEN',
      },
    });
  }

  // ---------- MOVIMIENTOS MANUALES ----------
  async addMovement(
    sessionId: number,
    dto: { kind: CashMovementKind; amount: number; note?: string },
  ) {
    const session = await this.prisma.cashSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('Sesión no encontrada.');
    if (session.status !== 'OPEN')
      throw new BadRequestException('La sesión no está abierta.');

    // Crear movimiento
    const amountDec = new Prisma.Decimal(dto.amount);
    const movement = await this.prisma.cashMovement.create({
      data: {
        sessionId,
        kind: dto.kind,
        amount: amountDec,
        refType: 'Manual',
      },
    });

    // Ajustar expectedClose según el tipo
    const sign = dto.kind === 'CASH_OUT' || dto.kind === 'REFUND' ? -1 : 1;
    await this.prisma.cashSession.update({
      where: { id: sessionId },
      data: { expectedClose: { increment: amountDec.mul(sign) } },
    });

    return movement;
  }

  // ---------- CIERRE / ARQUEO ----------
  async closeSession(
    id: number,
    dto: {
      countedClose: number;
      counts: { denom: string; qty: number }[];
      note?: string;
    },
  ) {
    const session = await this.prisma.cashSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException('Sesión no encontrada.');
    if (session.status !== 'OPEN')
      throw new BadRequestException('La sesión ya fue cerrada.');

    // Calcular total de conteo del servidor (seguridad)
    const totalCounted = dto.counts.reduce(
      (acc, r) => acc + Number(r.denom) * Number(r.qty || 0),
      0,
    );
    const countedDec = new Prisma.Decimal(totalCounted);

    // Persistir conteos + cerrar sesión en transacción
    const countRows = dto.counts.map((c) => ({
      sessionId: id,
      denom: String(c.denom),
      qty: Number(c.qty || 0),
      amount: new Prisma.Decimal(Number(c.denom) * Number(c.qty || 0)),
    }));

    await this.prisma.$transaction([
      // limpiar conteos previos (si reintentan)
      this.prisma.cashCount.deleteMany({ where: { sessionId: id } }),
      // crear conteos
      this.prisma.cashCount.createMany({ data: countRows }),
      // cerrar sesión
      this.prisma.cashSession.update({
        where: { id },
        data: {
          countedClose: countedDec,
          closedAt: new Date(),
          status: 'CLOSED',
          note: dto.note ?? session.note,
        },
      }),
    ]);

    // Devuelve resumen del cierre
    return this.prisma.cashSession.findUnique({
      where: { id },
      include: { counts: true, movements: true, register: true, user: true },
    });
  }
}
