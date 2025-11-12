import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type AuditPayload = {
  entity: string;
  entityId: number;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  userId?: number;
  changes?: unknown; // { before?: any; after?: any }
};

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(p: AuditPayload) {
    await this.prisma.auditLog.create({
      data: {
        entity: p.entity,
        entityId: p.entityId,
        action: p.action,
        userId: p.userId ?? null,
        changes: p.changes as any,
      },
    });
  }
}
