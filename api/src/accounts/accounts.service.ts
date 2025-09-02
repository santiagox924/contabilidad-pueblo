import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';

@Injectable()
export class AccountsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.coaAccount.findMany({ orderBy: { code: 'asc' } });
  }

  async create(data: CreateAccountDto) {
    try {
      return await this.prisma.coaAccount.create({ data });
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new ConflictException('El código de cuenta ya existe');
      }
      throw e;
    }
  }
}
