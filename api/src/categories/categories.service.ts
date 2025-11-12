// api/src/categories/categories.service.ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TaxProfile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { ACCOUNTS } from '../accounting/config/accounts.map';
import { CreateCategoryDto } from './dto/create-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  list(q?: string) {
    return this.prisma.category.findMany({
      where: q ? { name: { contains: q, mode: 'insensitive' } } : {},
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: number) {
    const cat = await this.prisma.category.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('Categoría no encontrada');
    return cat;
  }

  async create(dto: CreateCategoryDto) {
    const name = dto.name?.trim();
    if (!name) {
      throw new BadRequestException('El nombre de la categoría es obligatorio');
    }

    const fallbackVatId = await this.resolveVat19TaxId();
    const taxProfile = dto.taxProfile ?? TaxProfile.IVA_RESPONSABLE;

    let defaultTaxId: number | null;
    if (dto.defaultTaxId === null) {
      defaultTaxId = null;
    } else if (dto.defaultTaxId !== undefined) {
      defaultTaxId = dto.defaultTaxId;
    } else if (taxProfile === TaxProfile.IVA_RESPONSABLE) {
      defaultTaxId = fallbackVatId;
    } else {
      defaultTaxId = null;
    }

    if (taxProfile !== TaxProfile.IVA_RESPONSABLE) {
      defaultTaxId = null;
    }

    const incomeAccountCode =
      dto.incomeAccountCode === undefined
        ? ACCOUNTS.salesIncome
        : this.normalizeAccountCode(dto.incomeAccountCode);

    const expenseAccountCode =
      dto.expenseAccountCode === undefined
        ? ACCOUNTS.cogs
        : this.normalizeAccountCode(dto.expenseAccountCode);

    const inventoryAccountCode =
      dto.inventoryAccountCode === undefined
        ? ACCOUNTS.inventory
        : this.normalizeAccountCode(dto.inventoryAccountCode);

    let taxAccountCode =
      dto.taxAccountCode === undefined
        ? taxProfile === TaxProfile.IVA_RESPONSABLE
          ? ACCOUNTS.salesVat
          : null
        : this.normalizeAccountCode(dto.taxAccountCode);

    if (taxProfile !== TaxProfile.IVA_RESPONSABLE) {
      taxAccountCode = null;
    }

    try {
      return await this.prisma.category.create({
        // 'as any' because generated Prisma client types may need regenerating in some environments
        data: ({
          name,
          taxProfile,
          defaultTaxId,
          incomeAccountCode,
          expenseAccountCode,
          inventoryAccountCode,
          taxAccountCode,
          purchaseTaxAccountCode: dto.purchaseTaxAccountCode ?? null,
        } as any),
      });
    } catch (e: any) {
      if (e.code === 'P2002')
        throw new ConflictException('Ya existe una categoría con ese nombre');
      throw e;
    }
  }

  async update(id: number, dto: UpdateCategoryDto) {
    // Asegura que la categoría exista
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Categoría no encontrada');

    const fallbackVatId = await this.resolveVat19TaxId();

    const taxProfile =
      dto.taxProfile ?? existing.taxProfile ?? TaxProfile.IVA_RESPONSABLE;

    let defaultTaxId: number | null;
    if (dto.defaultTaxId === null) {
      defaultTaxId = null;
    } else if (dto.defaultTaxId !== undefined) {
      defaultTaxId = dto.defaultTaxId;
    } else if (
      existing.defaultTaxId !== null &&
      existing.defaultTaxId !== undefined
    ) {
      defaultTaxId = existing.defaultTaxId;
    } else if (taxProfile === TaxProfile.IVA_RESPONSABLE) {
      defaultTaxId = fallbackVatId;
    } else {
      defaultTaxId = null;
    }

    if (taxProfile !== TaxProfile.IVA_RESPONSABLE) {
      defaultTaxId = null;
    }

    const incomeAccountCode =
      dto.incomeAccountCode === null
        ? null
        : dto.incomeAccountCode !== undefined
          ? dto.incomeAccountCode
          : (existing.incomeAccountCode ?? ACCOUNTS.salesIncome);

    const expenseAccountCode =
      dto.expenseAccountCode === null
        ? null
        : dto.expenseAccountCode !== undefined
          ? dto.expenseAccountCode
          : (existing.expenseAccountCode ?? ACCOUNTS.cogs);

    const inventoryAccountCode =
      dto.inventoryAccountCode === null
        ? null
        : dto.inventoryAccountCode !== undefined
          ? dto.inventoryAccountCode
          : (existing.inventoryAccountCode ?? ACCOUNTS.inventory);

    let taxAccountCode =
      dto.taxAccountCode === null
        ? null
        : dto.taxAccountCode !== undefined
          ? dto.taxAccountCode
          : (existing.taxAccountCode ??
            (taxProfile === TaxProfile.IVA_RESPONSABLE
              ? ACCOUNTS.salesVat
              : null));

    if (taxProfile !== TaxProfile.IVA_RESPONSABLE) {
      taxAccountCode = null;
    }

    try {
      const updated = await this.prisma.category.update({
        where: { id },
        data: ({
          taxProfile,
          defaultTaxId,
          incomeAccountCode,
          expenseAccountCode,
          inventoryAccountCode,
          taxAccountCode,
          purchaseTaxAccountCode:
            dto.purchaseTaxAccountCode !== undefined
              ? dto.purchaseTaxAccountCode
              : (existing as any).purchaseTaxAccountCode ?? null,
        } as any),
      });
      return updated;
    } catch (e: any) {
      // por si en el futuro permites renombrar y choca el unique(name)
      if (e.code === 'P2002') {
        throw new ConflictException(
          'Conflicto de unicidad al actualizar la categoría',
        );
      }
      throw e;
    }
  }

  async remove(id: number) {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Categoría no encontrada');

    // Desasociamos los ítems antes de borrar la categoría para evitar referencias colgantes
    return this.prisma.$transaction(async (tx) => {
      await tx.item.updateMany({
        where: { categoryId: id },
        data: { categoryId: null },
      });
      return tx.category.delete({ where: { id } });
    });
  }

  private normalizeAccountCode(
    value: string | null | undefined,
  ): string | null {
    if (value === null || value === undefined) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private async resolveVat19TaxId(): Promise<number | null> {
    const vat = await this.prisma.tax.findUnique({ where: { code: 'IVA19' } });
    return vat?.id ?? null;
  }
}
