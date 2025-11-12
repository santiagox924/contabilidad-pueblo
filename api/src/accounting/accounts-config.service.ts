import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AccountsConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getLatestMap() {
    const latest = await this.prisma.accountsMap.findFirst({
      orderBy: { ts: 'desc' },
    });

    if (!latest) {
      throw new NotFoundException('No hay configuración de cuentas guardada.');
    }

    return latest.json;
  }

  async saveMap(json: any, authorId?: number) {
    return this.prisma.accountsMap.create({
      data: {
        json,
        authorId,
      },
    });
  }
}
