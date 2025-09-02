import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt'; // o 'bcryptjs'
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(private users: UsersService, private jwt: JwtService) {}

  async register(email: string, password: string) {
    const hash = await bcrypt.hash(password, 10);
    const user = await this.users.create(email, hash);
    return this.sign(user.id, user.email);
  }

  async login(email: string, password: string) {
    const user = await this.users.findByEmail(email);
    if (!user) throw new UnauthorizedException('Credenciales inválidas');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Credenciales inválidas');
    return this.sign(user.id, user.email);
  }

  private async sign(id: number, email: string) {
    const payload = { sub: id, email };
    return { access_token: await this.jwt.signAsync(payload) };
  }
}
