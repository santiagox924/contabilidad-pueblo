import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';

@Injectable()
export class ItemsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.item.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
  }

  async findOne(id: number) {
    const it = await this.prisma.item.findUnique({ where: { id } });
    if (!it || !it.active) throw new NotFoundException('Ítem no encontrado');
    return it;
  }

  async create(dto: CreateItemDto) {
    try {
      return await this.prisma.item.create({
        data: {
          sku: dto.sku,
          name: dto.name,
          type: dto.type,
          unit: dto.unit ?? 'UN',
          price: dto.price ?? 0,
          ivaPct: dto.ivaPct ?? 0,
        },
      });
    } catch (e: any) {
      if (e.code === 'P2002') throw new ConflictException('El SKU ya existe');
      throw e;
    }
  }

  async update(id: number, dto: UpdateItemDto) {
    await this.findOne(id);
    try {
      return await this.prisma.item.update({ where: { id }, data: dto });
    } catch (e: any) {
      if (e.code === 'P2002') throw new ConflictException('El SKU ya existe');
      throw e;
    }
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.item.update({ where: { id }, data: { active: false } });
    return { ok: true };
  }
}
