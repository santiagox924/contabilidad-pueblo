import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateJournalDto } from './dto/create-journal.dto';
import { UpdateJournalDto } from './dto/update-journal.dto';

@Injectable()
export class JournalsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.journal.findMany();
  }

  async findOne(id: number) {
    const journal = await this.prisma.journal.findUnique({ where: { id } });
    if (!journal) {
      throw new NotFoundException(`Journal con id ${id} no encontrado`);
    }
    return journal;
  }

  async create(dto: CreateJournalDto) {
    return this.prisma.journal.create({ data: dto });
  }

  async update(id: number, dto: UpdateJournalDto) {
    return this.prisma.journal.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: number) {
    return this.prisma.journal.delete({ where: { id } });
  }
}
