import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { UserRoleCode } from '@prisma/client';

@Injectable()
export class CanOpenPeriodPolicy implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Solo usuarios con rol ACCOUNTING_ADMIN pueden abrir periodos
    if (!user?.roles?.includes(UserRoleCode.ACCOUNTING_ADMIN)) {
      throw new ForbiddenException(
        'No tienes permisos para abrir periodos contables.',
      );
    }

    // Aquí podrías añadir validaciones extra (ej. que el periodo anterior esté cerrado)

    return true;
  }
}
