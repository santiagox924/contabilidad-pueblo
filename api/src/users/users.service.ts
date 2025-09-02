import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(email: string, passwordHash: string) {
    try {
      return await this.prisma.user.create({ data: { email, passwordHash } });
    } catch (e: any) {
      if (e.code === 'P2002') throw new ConflictException('El email ya está registrado');
      throw e;
    }
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }
}
