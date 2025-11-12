import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { UserRoleCode } from '@prisma/client';

@Injectable()
export class CanConfigureMapPolicy implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.roles?.includes(UserRoleCode.ACCOUNTING_ADMIN)) {
      throw new ForbiddenException(
        'No tienes permisos para configurar el mapa de cuentas.',
      );
    }

    return true;
  }
}
