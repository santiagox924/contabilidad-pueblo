import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    cfg: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = cfg.get<string>('JWT_SECRET');
    if (!secret) throw new Error('JWT_SECRET no está definido');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { roles: true },
    });
    if (!user)
      throw new UnauthorizedException('Usuario autenticado no encontrado');
    return {
      id: user.id,
      email: user.email,
      roles: user.roles?.map((r) => r.role) ?? [],
    };
  }
}
