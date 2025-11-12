import { ConflictException, Injectable } from '@nestjs/common';
import { UserRoleCode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(
    email: string,
    passwordHash: string,
    roles: UserRoleCode[] = [],
  ) {
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({ data: { email, passwordHash } });
        if (roles.length > 0) {
          await tx.userRole.createMany({
            data: roles.map((role) => ({ userId: created.id, role })),
            skipDuplicates: true,
          });
        }
        return tx.user.findUnique({
          where: { id: created.id },
          include: { roles: true },
        });
      });
      return user;
    } catch (e: any) {
      if (e.code === 'P2002')
        throw new ConflictException('El email ya está registrado');
      throw e;
    }
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: { roles: true },
    });
  }

  findAll() {
    return this.prisma.user.findMany({ include: { roles: true } });
  }

  async setRoles(userId: number, roles: UserRoleCode[]) {
    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId } });
      if (roles.length > 0) {
        await tx.userRole.createMany({
          data: roles.map((role) => ({ userId, role })),
          skipDuplicates: true,
        });
      }
    });
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: true },
    });
  }
}
