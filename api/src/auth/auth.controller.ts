import { Body, Controller, Get, Post } from '@nestjs/common';
import { Public } from './public.decorator';
import { AuthService } from './auth.service';

class LoginDto {
  email!: string;
  password!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Public()
  @Get('health')
  health() {
    return { ok: true, ts: new Date().toISOString() };
  }
}
