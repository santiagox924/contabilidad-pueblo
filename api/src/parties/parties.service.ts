import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePartyDto } from './dto/create-party.dto';
import { UpdatePartyDto } from './dto/update-party.dto';

@Injectable()
export class PartiesService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  findAll() {
    return this.prisma.thirdParty.findMany({
      where: { active: true },
      orderBy: [{ name: 'asc' }],
    });
  }

  findOne(id: number) {
    return this.prisma.thirdParty.findUnique({ where: { id } });
  }

  async create(dto: CreatePartyDto, userId?: number) {
    try {
      const created = await this.prisma.thirdParty.create({ data: dto });
      await this.audit.log({
        entity: 'ThirdParty',
        entityId: created.id,
        action: 'CREATE',
        userId,
        changes: { after: created },
      });
      return created;
    } catch (e: any) {
      if (e.code === 'P2002') throw new ConflictException('El documento ya está registrado');
      throw e;
    }
  }

  async update(id: number, dto: UpdatePartyDto, userId?: number) {
    const before = await this.prisma.thirdParty.findUnique({ where: { id } });
    if (!before || !before.active) throw new NotFoundException('Tercero no encontrado');

    try {
      const after = await this.prisma.thirdParty.update({ where: { id }, data: dto });
      await this.audit.log({
        entity: 'ThirdParty',
        entityId: id,
        action: 'UPDATE',
        userId,
        changes: { before, after },
      });
      return after;
    } catch (e: any) {
      if (e.code === 'P2002') throw new ConflictException('El documento ya está registrado');
      throw e;
    }
  }

  async remove(id: number, userId?: number) {
    const before = await this.prisma.thirdParty.findUnique({ where: { id } });
    if (!before || !before.active) throw new NotFoundException('Tercero no encontrado');

    const after = await this.prisma.thirdParty.update({
      where: { id },
      data: { active: false },
    });

    await this.audit.log({
      entity: 'ThirdParty',
      entityId: id,
      action: 'DELETE',
      userId,
      changes: { before, after },
    });

    return { ok: true };
  }
}
