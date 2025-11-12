import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, FlowType, TaxProfile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

function define<T extends object>(obj: T, key: keyof T, value: any) {
  if (value !== undefined) (obj as any)[key] = value;
}

@Injectable()
export class AccountsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.coaAccount.findMany({ orderBy: { code: 'asc' } });
  }

  async findOne(id: number) {
    const row = await this.prisma.coaAccount.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Cuenta no encontrada');
    return row;
  }

  async create(data: CreateAccountDto) {
    try {
      // Reglas endurecidas para bancos
      if (data.isBank && data.isCash) {
        throw new BadRequestException(
          'Una cuenta bancaria no puede ser de efectivo (isCash=true).',
        );
      }

      const payload: Prisma.CoaAccountCreateInput = {
        code: data.code,
        name: data.name,
        nature: data.nature,
        class: data.class,
        current: data.current ?? false,
        // Si es banco, forzar reconcilable=true
        reconcilable: data.isBank ? true : (data.reconcilable ?? false),
        isBank: data.isBank ?? false,
        // Prohibido isCash cuando es banco
        isCash: data.isBank ? false : (data.isCash ?? false),
        isDetailed: data.isDetailed ?? true,
        parentCode: data.parentCode ?? null,
        requiresThirdParty: data.requiresThirdParty ?? false,
        requiresCostCenter: data.requiresCostCenter ?? false,
        flowType: data.flowType ?? FlowType.NONE,
        taxProfile: data.taxProfile ?? TaxProfile.NA,
        vatRate: data.vatRate ?? null,
      };
      return await this.prisma.coaAccount.create({ data: payload });
    } catch (e: any) {
      if (e.code === 'P2002')
        throw new ConflictException('El código de cuenta ya existe');
      throw e;
    }
  }

  async update(id: number, data: UpdateAccountDto) {
    const current = await this.findOne(id); // 404 si no existe

    // Resultado efectivo de flags tras el update (lo que quedaría luego de aplicar "data")
    const resulting = {
      isBank: 'isBank' in data ? Boolean(data.isBank) : current.isBank,
      isCash: 'isCash' in data ? Boolean(data.isCash) : current.isCash,
      isDetailed:
        'isDetailed' in data ? Boolean(data.isDetailed) : current.isDetailed,
      reconcilable:
        'reconcilable' in data
          ? Boolean(data.reconcilable)
          : current.reconcilable,
    };

    // Reglas: banco ⇒ reconcilable=true y cash prohibido
    if (resulting.isBank) {
      if (resulting.isCash) {
        throw new BadRequestException(
          'Una cuenta bancaria no puede ser de efectivo (isCash=true).',
        );
      }
    }

    // Cambio isDetailed: true -> false con líneas existentes ⇒ rechazar
    if (
      current.isDetailed &&
      'isDetailed' in data &&
      data.isDetailed === false
    ) {
      const jlCount = await this.prisma.journalLine.count({
        where: { accountCode: current.code },
      });
      if (jlCount > 0) {
        throw new BadRequestException(
          'No se puede cambiar isDetailed a false: la cuenta tiene movimientos contables.',
        );
      }
    }

    const payload: Prisma.CoaAccountUpdateInput = {};
    define(payload, 'code', data.code);
    define(payload, 'name', data.name);
    define(payload, 'nature', data.nature);
    define(payload, 'class', data.class);
    define(payload, 'current', data.current);

    // reconcilable: si es banco debe quedar true, aunque envíen false
    if ('reconcilable' in data || resulting.isBank !== current.isBank) {
      define(
        payload,
        'reconcilable',
        resulting.isBank ? true : data.reconcilable,
      );
    }

    // isBank e isCash (cash prohibido si banco)
    if ('isBank' in data) define(payload, 'isBank', data.isBank);
    if ('isCash' in data) {
      if (resulting.isBank && data.isCash) {
        throw new BadRequestException(
          'Una cuenta bancaria no puede ser de efectivo (isCash=true).',
        );
      }
      define(payload, 'isCash', data.isCash);
    }

    define(payload, 'isDetailed', data.isDetailed);
    if ('parentCode' in data)
      define(payload, 'parentCode', data.parentCode ?? null);
    if ('vatRate' in data) define(payload, 'vatRate', data.vatRate ?? null);
    define(payload, 'requiresThirdParty', data.requiresThirdParty);
    define(payload, 'requiresCostCenter', data.requiresCostCenter);
    define(payload, 'flowType', data.flowType);
    define(payload, 'taxProfile', data.taxProfile);

    try {
      return await this.prisma.coaAccount.update({
        where: { id },
        data: payload,
      });
    } catch (e: any) {
      if (e.code === 'P2002')
        throw new ConflictException('El código de cuenta ya existe');
      throw e;
    }
  }

  async remove(id: number) {
    const acc = await this.findOne(id);
    // (Opcional) bloquear si hay movimientos
    const jlCount = await this.prisma.journalLine.count({
      where: { accountCode: acc.code },
    });
    if (jlCount > 0) {
      throw new BadRequestException(
        'No se puede eliminar la cuenta: tiene movimientos contables asociados.',
      );
    }
    return this.prisma.coaAccount.delete({ where: { id } });
  }
}
