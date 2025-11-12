import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DepreciationMethod,
  DepreciationRunStatus,
  FixedAsset,
  FixedAssetCategory,
  FixedAssetLocation,
  FixedAssetMovementType,
  FixedAssetPolicy,
  FixedAssetStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AccountingLineInput,
  AccountingService,
} from '../accounting/accounting.service';
import {
  CreateFixedAssetBatchDto,
  CreateFixedAssetDto,
  DEPRECIATION_METHOD_VALUES,
} from './dto/create-fixed-asset.dto';
import {
  CreateFixedAssetCategoryDto,
  UpdateFixedAssetCategoryDto,
} from './dto/create-fixed-asset-category.dto';
import {
  CreateFixedAssetLocationDto,
  UpdateFixedAssetLocationDto,
} from './dto/create-fixed-asset-location.dto';
import {
  CreateFixedAssetPolicyDto,
  UpdateFixedAssetPolicyDto,
} from './dto/create-fixed-asset-policy.dto';
import { RegisterImprovementDto } from './dto/register-improvement.dto';
import { DisposeFixedAssetDto } from './dto/dispose-fixed-asset.dto';
import { RunDepreciationDto } from './dto/run-depreciation.dto';

type FixedAssetWithCategory = FixedAsset & {
  category: FixedAssetCategory;
  locationRef?: FixedAssetLocation | null;
  policy?: FixedAssetPolicy | null;
};

type Decimalish = number | string | Prisma.Decimal | null | undefined;

const DecimalCtor = Prisma.Decimal;

type LocationView = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  notes: string | null;
  parentId: number | null;
  parent: { id: number; code: string; name: string } | null;
  createdAt: Date;
  updatedAt: Date;
  children: LocationView[];
};

@Injectable()
export class FixedAssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
  ) {}

  async listCategories() {
    const categories = await this.prisma.fixedAssetCategory.findMany({
      orderBy: { code: 'asc' },
    });
    return categories.map((category) => this.mapCategory(category));
  }

  async createCategory(dto: CreateFixedAssetCategoryDto) {
    const method = dto.depreciationMethod as DepreciationMethod;

    const created = await this.prisma.fixedAssetCategory.create({
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description ?? null,
        depreciationMethod: method,
        usefulLifeMonths: dto.usefulLifeMonths,
        residualRate:
          dto.residualRate != null
            ? new DecimalCtor(dto.residualRate)
            : undefined,
        assetAccountCode: dto.assetAccountCode,
        accumulatedDepreciationAccountCode:
          dto.accumulatedDepreciationAccountCode,
        depreciationExpenseAccountCode: dto.depreciationExpenseAccountCode,
        disposalGainAccountCode: dto.disposalGainAccountCode ?? null,
        disposalLossAccountCode: dto.disposalLossAccountCode ?? null,
        impairmentAccountCode: dto.impairmentAccountCode ?? null,
        defaultCostCenterId: dto.defaultCostCenterId ?? null,
        notes: dto.notes ?? null,
      },
    });
    return this.mapCategory(created);
  }

  async updateCategory(id: number, dto: UpdateFixedAssetCategoryDto) {
    const existing = await this.prisma.fixedAssetCategory.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Categoría de activos fijos no encontrada');
    }

    const data: Prisma.FixedAssetCategoryUpdateInput = {};

    if (dto.code != null) data.code = dto.code;
    if (dto.name != null) data.name = dto.name;
    if (dto.description !== undefined)
      data.description = dto.description ?? null;
    if (dto.depreciationMethod != null) {
      if (!DEPRECIATION_METHOD_VALUES.includes(dto.depreciationMethod as any)) {
        throw new BadRequestException('Método de depreciación inválido');
      }
      data.depreciationMethod = dto.depreciationMethod as DepreciationMethod;
    }
    if (dto.usefulLifeMonths != null) {
      if (
        !Number.isInteger(dto.usefulLifeMonths) ||
        dto.usefulLifeMonths <= 0
      ) {
        throw new BadRequestException('Vida útil inválida');
      }
      data.usefulLifeMonths = dto.usefulLifeMonths;
    }
    if (dto.residualRate != null) {
      data.residualRate = new DecimalCtor(dto.residualRate);
    }
    if (dto.assetAccountCode != null)
      data.assetAccountCode = dto.assetAccountCode;
    if (dto.accumulatedDepreciationAccountCode != null) {
      data.accumulatedDepreciationAccountCode =
        dto.accumulatedDepreciationAccountCode;
    }
    if (dto.depreciationExpenseAccountCode != null) {
      data.depreciationExpenseAccountCode = dto.depreciationExpenseAccountCode;
    }
    if (dto.disposalGainAccountCode !== undefined) {
      data.disposalGainAccountCode = dto.disposalGainAccountCode ?? null;
    }
    if (dto.disposalLossAccountCode !== undefined) {
      data.disposalLossAccountCode = dto.disposalLossAccountCode ?? null;
    }
    if (dto.impairmentAccountCode !== undefined) {
      data.impairmentAccountCode = dto.impairmentAccountCode ?? null;
    }
    if (dto.defaultCostCenterId !== undefined) {
      data.defaultCostCenter = dto.defaultCostCenterId
        ? { connect: { id: dto.defaultCostCenterId } }
        : { disconnect: true };
    }
    if (dto.notes !== undefined) {
      data.notes = dto.notes ?? null;
    }

    const updated = await this.prisma.fixedAssetCategory.update({
      where: { id },
      data,
    });
    return this.mapCategory(updated);
  }

  async removeCategory(id: number) {
    const assetCount = await this.prisma.fixedAsset.count({
      where: { categoryId: id },
    });
    if (assetCount > 0) {
      throw new BadRequestException(
        'No se puede eliminar la categoría porque tiene activos asociados',
      );
    }
    await this.prisma.fixedAssetCategory.delete({ where: { id } });
    return { deleted: true };
  }

  async listLocations() {
    const locations = await this.prisma.fixedAssetLocation.findMany({
      orderBy: { code: 'asc' },
      include: { children: { orderBy: { code: 'asc' } }, parent: true },
    });
    return locations.map((location) => this.mapLocation(location));
  }

  async createLocation(dto: CreateFixedAssetLocationDto) {
    let parentId: number | null = null;
    if (dto.parentId != null) {
      const parent = await this.prisma.fixedAssetLocation.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) {
        throw new NotFoundException(
          'Ubicación de activo fijo padre no encontrada',
        );
      }
      parentId = parent.id;
    }

    const created = await this.prisma.fixedAssetLocation.create({
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description ?? null,
        isActive: dto.isActive ?? true,
        notes: dto.notes ?? null,
        parentId,
      },
      include: { parent: true, children: true },
    });
    return this.mapLocation(created);
  }

  async updateLocation(id: number, dto: UpdateFixedAssetLocationDto) {
    const existing = await this.prisma.fixedAssetLocation.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Ubicación de activo fijo no encontrada');
    }

    if (dto.parentId === id) {
      throw new BadRequestException(
        'Una ubicación no puede ser su propio padre',
      );
    }

    let parentId: number | null | undefined;
    if (dto.parentId !== undefined) {
      if (dto.parentId === null) {
        parentId = null;
      } else {
        const parent = await this.prisma.fixedAssetLocation.findUnique({
          where: { id: dto.parentId },
        });
        if (!parent) {
          throw new NotFoundException('Ubicación padre no encontrada');
        }
        parentId = parent.id;
      }
    }

    const data: Prisma.FixedAssetLocationUpdateInput = {};
    if (dto.code != null) data.code = dto.code;
    if (dto.name != null) data.name = dto.name;
    if (dto.description !== undefined)
      data.description = dto.description ?? null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.notes !== undefined) data.notes = dto.notes ?? null;
    if (parentId !== undefined) {
      data.parent = parentId
        ? { connect: { id: parentId } }
        : { disconnect: true };
    }

    const updated = await this.prisma.fixedAssetLocation.update({
      where: { id },
      data,
      include: { parent: true, children: true },
    });
    return this.mapLocation(updated);
  }

  async removeLocation(id: number) {
    const [assetCount, children] = await Promise.all([
      this.prisma.fixedAsset.count({ where: { locationId: id } }),
      this.prisma.fixedAssetLocation.count({ where: { parentId: id } }),
    ]);
    if (assetCount > 0) {
      throw new BadRequestException(
        'No se puede eliminar la ubicación porque tiene activos asociados',
      );
    }
    if (children > 0) {
      throw new BadRequestException(
        'No se puede eliminar la ubicación porque tiene sububicaciones',
      );
    }
    await this.prisma.fixedAssetLocation.delete({ where: { id } });
    return { deleted: true };
  }

  async listPolicies() {
    const policies = await this.prisma.fixedAssetPolicy.findMany({
      orderBy: { policyNumber: 'asc' },
    });
    return policies.map((policy) => this.mapPolicy(policy));
  }

  async createPolicy(dto: CreateFixedAssetPolicyDto) {
    const startDate = this.parseDateOrThrow(dto.startDate, 'startDate');
    const endDate = this.parseDateOrThrow(dto.endDate, 'endDate');
    if (startDate && endDate && endDate < startDate) {
      throw new BadRequestException(
        'La fecha final de la póliza no puede ser anterior al inicio',
      );
    }

    const currency = dto.currencyCode ? dto.currencyCode.toUpperCase() : null;

    const created = await this.prisma.fixedAssetPolicy.create({
      data: {
        provider: dto.provider,
        policyNumber: dto.policyNumber,
        coverageSummary: dto.coverageSummary ?? null,
        startDate,
        endDate,
        premium: dto.premium != null ? new DecimalCtor(dto.premium) : undefined,
        currencyCode: currency,
        contactName: dto.contactName ?? null,
        contactEmail: dto.contactEmail ?? null,
        contactPhone: dto.contactPhone ?? null,
        isActive: dto.isActive ?? true,
        notes: dto.notes ?? null,
      },
    });
    return this.mapPolicy(created);
  }

  async updatePolicy(id: number, dto: UpdateFixedAssetPolicyDto) {
    const existing = await this.prisma.fixedAssetPolicy.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Póliza de activo fijo no encontrada');
    }

    const data: Prisma.FixedAssetPolicyUpdateInput = {};
    let startDate: Date | null | undefined;
    let endDate: Date | null | undefined;
    if (dto.provider != null) data.provider = dto.provider;
    if (dto.policyNumber != null) data.policyNumber = dto.policyNumber;
    if (dto.coverageSummary !== undefined)
      data.coverageSummary = dto.coverageSummary ?? null;

    if (dto.startDate !== undefined) {
      startDate = this.parseDateOrThrow(dto.startDate, 'startDate') ?? null;
      data.startDate = startDate;
    }
    if (dto.endDate !== undefined) {
      endDate = this.parseDateOrThrow(dto.endDate, 'endDate') ?? null;
      data.endDate = endDate;
    }

    if (dto.premium !== undefined) {
      data.premium = dto.premium != null ? new DecimalCtor(dto.premium) : null;
    }
    if (dto.currencyCode !== undefined) {
      data.currencyCode = dto.currencyCode
        ? dto.currencyCode.toUpperCase()
        : null;
    }
    if (dto.contactName !== undefined)
      data.contactName = dto.contactName ?? null;
    if (dto.contactEmail !== undefined)
      data.contactEmail = dto.contactEmail ?? null;
    if (dto.contactPhone !== undefined)
      data.contactPhone = dto.contactPhone ?? null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.notes !== undefined) data.notes = dto.notes ?? null;

    const finalStart = startDate ?? existing.startDate ?? null;
    const finalEnd = endDate ?? existing.endDate ?? null;
    if (finalStart && finalEnd && finalEnd < finalStart) {
      throw new BadRequestException(
        'La fecha final de la póliza no puede ser anterior al inicio',
      );
    }

    const updated = await this.prisma.fixedAssetPolicy.update({
      where: { id },
      data,
    });
    return this.mapPolicy(updated);
  }

  async removePolicy(id: number) {
    const assetCount = await this.prisma.fixedAsset.count({
      where: { policyId: id },
    });
    if (assetCount > 0) {
      throw new BadRequestException(
        'No se puede eliminar la póliza porque hay activos asociados',
      );
    }
    await this.prisma.fixedAssetPolicy.delete({ where: { id } });
    return { deleted: true };
  }

  async listAssets() {
    const assets = await this.prisma.fixedAsset.findMany({
      include: {
        category: true,
        costCenter: true,
        thirdParty: true,
        locationRef: true,
        policy: true,
      },
      orderBy: { code: 'asc' },
    });
    return assets.map((asset) => this.mapAsset(asset));
  }

  async findOne(id: number) {
    const asset = await this.prisma.fixedAsset.findUnique({
      where: { id },
      include: {
        category: true,
        costCenter: true,
        thirdParty: true,
        locationRef: true,
        policy: true,
      },
    });
    if (!asset) throw new NotFoundException('Activo fijo no encontrado');
    return this.mapAsset(asset);
  }

  async create(dto: CreateFixedAssetDto) {
    const category = await this.prisma.fixedAssetCategory.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) {
      throw new NotFoundException('Categoría de activos fijos no encontrada');
    }

    const method = this.resolveMethod(dto.depreciationMethod, category);
    const usefulLife = dto.usefulLifeMonths ?? category.usefulLifeMonths;
    if (!Number.isInteger(usefulLife) || usefulLife <= 0) {
      throw new BadRequestException('Vida útil inválida');
    }

    const acquisitionCost = new DecimalCtor(dto.acquisitionCost);
    if (acquisitionCost.lte(0)) {
      throw new BadRequestException('Costo de adquisición debe ser positivo');
    }

    const residualValue = this.resolveResidualValue(
      dto,
      category,
      acquisitionCost,
    );
    if (residualValue.lt(0)) {
      throw new BadRequestException('Valor residual inválido');
    }
    if (residualValue.gt(acquisitionCost)) {
      throw new BadRequestException('El residual no puede exceder el costo');
    }

    const depreciationStart = new Date(
      dto.depreciationStart ?? dto.acquisitionDate,
    );
    const acquisitionDate = new Date(dto.acquisitionDate);
    if (Number.isNaN(depreciationStart.getTime())) {
      throw new BadRequestException('Fecha de inicio de depreciación inválida');
    }
    if (Number.isNaN(acquisitionDate.getTime())) {
      throw new BadRequestException('Fecha de adquisición inválida');
    }
    if (depreciationStart < acquisitionDate) {
      throw new BadRequestException(
        'La depreciación no puede iniciar antes de la compra',
      );
    }

    const decliningRate = this.resolveDecliningRate(dto, method);
    const costCenterId =
      dto.costCenterId ?? category.defaultCostCenterId ?? null;
    const thirdPartyId = dto.thirdPartyId ?? null;
    const metadata = dto.metadata as Prisma.InputJsonValue | undefined;
    const shouldPost = dto.postToAccounting === true;
    const counterpartyAccount = dto.counterpartyAccountCode?.trim() ?? null;
    if (shouldPost && !counterpartyAccount) {
      throw new BadRequestException(
        'Debe indicar la cuenta contable contrapartida para registrar el alta del activo',
      );
    }
    const movementDescription = dto.description ?? `Alta activo ${dto.name}`;

    let locationId: number | null = null;
    if (dto.locationId != null) {
      const location = await this.prisma.fixedAssetLocation.findUnique({
        where: { id: dto.locationId },
      });
      if (!location) {
        throw new NotFoundException('Ubicación de activo fijo no encontrada');
      }
      if (!location.isActive) {
        throw new BadRequestException('La ubicación del activo está inactiva');
      }
      locationId = location.id;
    }

    let policyId: number | null = null;
    let policyNumber = dto.policyNumber ?? null;
    if (dto.policyId != null) {
      const policy = await this.prisma.fixedAssetPolicy.findUnique({
        where: { id: dto.policyId },
      });
      if (!policy) {
        throw new NotFoundException('Póliza de activo fijo no encontrada');
      }
      if (!policy.isActive) {
        throw new BadRequestException('La póliza asociada está inactiva');
      }
      policyId = policy.id;
      if (!policyNumber) {
        policyNumber = policy.policyNumber;
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const code = dto.code ?? (await this.generateCode(tx, category));
      const baseValue = acquisitionCost.minus(residualValue);

      const created = await tx.fixedAsset.create({
        data: {
          code,
          name: dto.name,
          categoryId: dto.categoryId,
          locationId,
          policyId,
          acquisitionDate,
          acquisitionCost,
          residualValue,
          bookValue: baseValue,
          accumulatedDepreciation: new DecimalCtor(0),
          usefulLifeMonths: usefulLife,
          depreciationMethod: method,
          decliningBalanceRate: decliningRate,
          depreciationStart,
          costCenterId,
          thirdPartyId,
          location: dto.location ?? null,
          serialNumber: dto.serialNumber ?? null,
          policyNumber,
          supportUrl: dto.supportUrl ?? null,
          description: dto.description ?? null,
          customFields: metadata ?? Prisma.JsonNull,
        },
        include: {
          category: true,
          costCenter: true,
          thirdParty: true,
          locationRef: true,
          policy: true,
        },
      });

      const movement = await tx.fixedAssetMovement.create({
        data: {
          assetId: created.id,
          type: FixedAssetMovementType.ADDITION,
          movementDate: acquisitionDate,
          amount: acquisitionCost.toDecimalPlaces(2, DecimalCtor.ROUND_HALF_UP),
          bookValueAfter: baseValue,
          accumulatedAfter: new DecimalCtor(0),
          costCenterId: costCenterId ?? null,
          thirdPartyId,
          description: movementDescription,
          metadata: metadata ?? Prisma.JsonNull,
          counterpartyAccountCode: counterpartyAccount,
          createdBy: dto.createdBy ?? null,
        },
      });

      let journalEntryId: number | null = null;
      if (shouldPost) {
        const assetAccount = this.ensureAccount(
          created.category.assetAccountCode,
          'La categoría no tiene cuenta contable de activo',
        );
        const balancingAccount = this.ensureAccount(
          counterpartyAccount,
          'Debe indicar la cuenta contable contrapartida para registrar el alta del activo',
        );
        const amountNumber = Number(acquisitionCost.toFixed(2));
        const entry = await this.accounting.createEntryWithExistingTransaction(
          tx,
          {
            date: acquisitionDate,
            sourceType: 'FIXED_ASSET_ADDITION',
            sourceId: movement.id,
            description: movementDescription,
            lines: [
              {
                accountCode: assetAccount,
                debit: amountNumber,
                thirdPartyId: thirdPartyId ?? undefined,
                costCenterId: costCenterId ?? undefined,
                description: movementDescription,
              },
              {
                accountCode: balancingAccount,
                credit: amountNumber,
                thirdPartyId: thirdPartyId ?? undefined,
                costCenterId: costCenterId ?? undefined,
                description: movementDescription,
              },
            ],
          },
        );
        journalEntryId = entry.id;
        await tx.fixedAssetMovement.update({
          where: { id: movement.id },
          data: { journalEntryId: entry.id },
        });
      }

      return { created, journalEntryId };
    });

    const mapped = this.mapAsset(result.created);
    if (result.journalEntryId) {
      return { ...mapped, lastJournalEntryId: result.journalEntryId };
    }
    return mapped;
  }

  async createBatch(dto: CreateFixedAssetBatchDto) {
    if (!dto.assets.length) {
      throw new BadRequestException('Debe enviar al menos un activo');
    }
    const results = [];
    for (const asset of dto.assets) {
      results.push(await this.create(asset));
    }
    return results;
  }

  async registerImprovement(assetId: number, dto: RegisterImprovementDto) {
    const asset = await this.prisma.fixedAsset.findUnique({
      where: { id: assetId },
      include: {
        category: true,
        costCenter: true,
        thirdParty: true,
        locationRef: true,
        policy: true,
      },
    });
    if (!asset) {
      throw new NotFoundException('Activo fijo no encontrado');
    }
    if (asset.status === FixedAssetStatus.DISPOSED) {
      throw new BadRequestException(
        'No se pueden registrar mejoras sobre un activo dado de baja',
      );
    }

    const amount = new DecimalCtor(dto.amount);
    if (amount.lte(0)) {
      throw new BadRequestException('El monto de la mejora debe ser positivo');
    }

    const movementDate = dto.movementDate
      ? this.parseDateOrThrow(dto.movementDate, 'movementDate')!
      : new Date();

    const extendLife = dto.extendLifeMonths ?? 0;
    if (extendLife < 0) {
      throw new BadRequestException('El ajuste de vida útil debe ser positivo');
    }

    if (
      dto.decliningRateOverride != null &&
      (dto.decliningRateOverride <= 0 || dto.decliningRateOverride >= 1)
    ) {
      throw new BadRequestException(
        'La tasa de saldo decreciente debe estar entre 0 y 1',
      );
    }
    if (
      dto.decliningRateOverride != null &&
      asset.depreciationMethod !== DepreciationMethod.DECLINING_BALANCE
    ) {
      throw new BadRequestException(
        'Solo se puede ajustar la tasa en activos de saldo decreciente',
      );
    }

    const costCenterId = dto.costCenterId ?? asset.costCenterId ?? null;
    const thirdPartyId = dto.thirdPartyId ?? asset.thirdPartyId ?? null;

    const metadata: Record<string, unknown> = { ...(dto.metadata ?? {}) };
    if (extendLife > 0) metadata.extendLifeMonths = extendLife;
    if (dto.residualIncrease != null)
      metadata.residualIncrease = dto.residualIncrease;

    const counterpartyAccount = dto.counterpartyAccountCode?.trim() ?? null;
    const shouldPost = dto.postToAccounting === true;
    if (shouldPost && !counterpartyAccount) {
      throw new BadRequestException(
        'Debe indicar la cuenta contable contrapartida para registrar la mejora',
      );
    }

    const description = dto.description ?? `Mejora activo ${asset.code}`;

    const result = await this.prisma.$transaction(async (tx) => {
      const data: Prisma.FixedAssetUpdateInput = {
        acquisitionCost: new DecimalCtor(asset.acquisitionCost).plus(amount),
        bookValue: new DecimalCtor(asset.bookValue ?? 0).plus(amount),
      };

      if (extendLife > 0) {
        data.usefulLifeMonths = asset.usefulLifeMonths + extendLife;
      }
      if (dto.residualIncrease != null) {
        data.residualValue = new DecimalCtor(asset.residualValue ?? 0).plus(
          dto.residualIncrease,
        );
      }
      if (dto.decliningRateOverride != null) {
        data.decliningBalanceRate = new DecimalCtor(dto.decliningRateOverride);
      }

      const updatedAsset = await tx.fixedAsset.update({
        where: { id: assetId },
        data,
        include: {
          category: true,
          costCenter: true,
          thirdParty: true,
          locationRef: true,
          policy: true,
        },
      });

      const movement = await tx.fixedAssetMovement.create({
        data: {
          assetId,
          type: FixedAssetMovementType.IMPROVEMENT,
          movementDate,
          amount: amount.toDecimalPlaces(2, DecimalCtor.ROUND_HALF_UP),
          bookValueAfter: new DecimalCtor(updatedAsset.bookValue ?? 0),
          accumulatedAfter: new DecimalCtor(
            updatedAsset.accumulatedDepreciation ?? 0,
          ),
          description,
          costCenterId,
          thirdPartyId,
          metadata: Object.keys(metadata).length
            ? (metadata as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          counterpartyAccountCode: counterpartyAccount,
          createdBy: dto.createdBy ?? null,
        },
      });

      let journalEntryId: number | null = null;
      if (shouldPost) {
        const assetAccount = this.ensureAccount(
          asset.category.assetAccountCode,
          'La categoría no tiene cuenta contable de activo',
        );
        const balancingAccount = this.ensureAccount(
          counterpartyAccount,
          'Debe indicar la cuenta contable contrapartida para registrar la mejora',
        );
        const amountNumber = Number(amount.toFixed(2));
        const entry = await this.accounting.createEntryWithExistingTransaction(
          tx,
          {
            date: movementDate,
            sourceType: 'FIXED_ASSET_IMPROVEMENT',
            sourceId: movement.id,
            description,
            lines: [
              {
                accountCode: assetAccount,
                debit: amountNumber,
                thirdPartyId: thirdPartyId ?? undefined,
                costCenterId: costCenterId ?? undefined,
                description,
              },
              {
                accountCode: balancingAccount,
                credit: amountNumber,
                thirdPartyId: thirdPartyId ?? undefined,
                costCenterId: costCenterId ?? undefined,
                description,
              },
            ],
          },
        );
        journalEntryId = entry.id;
        await tx.fixedAssetMovement.update({
          where: { id: movement.id },
          data: { journalEntryId: entry.id },
        });
      }

      return { updatedAsset, journalEntryId };
    });

    const mapped = this.mapAsset(result.updatedAsset);
    if (result.journalEntryId) {
      return { ...mapped, lastJournalEntryId: result.journalEntryId };
    }
    return mapped;
  }

  async disposeAsset(assetId: number, dto: DisposeFixedAssetDto) {
    const asset = await this.prisma.fixedAsset.findUnique({
      where: { id: assetId },
      include: {
        category: true,
        costCenter: true,
        thirdParty: true,
        locationRef: true,
        policy: true,
      },
    });
    if (!asset) {
      throw new NotFoundException('Activo fijo no encontrado');
    }
    if (asset.status === FixedAssetStatus.DISPOSED) {
      throw new BadRequestException('El activo ya fue dado de baja');
    }

    const movementDate = dto.movementDate
      ? this.parseDateOrThrow(dto.movementDate, 'movementDate')!
      : new Date();

    const proceeds =
      dto.proceeds != null ? new DecimalCtor(dto.proceeds) : new DecimalCtor(0);
    if (proceeds.lt(0)) {
      throw new BadRequestException('El valor de venta debe ser positivo');
    }

    const acquisitionCost = new DecimalCtor(asset.acquisitionCost);
    const accumulated = new DecimalCtor(asset.accumulatedDepreciation ?? 0);
    const residualValue = new DecimalCtor(asset.residualValue ?? 0);
    let bookToWriteOff = acquisitionCost.minus(accumulated);
    if (bookToWriteOff.lt(0)) {
      bookToWriteOff = new DecimalCtor(0);
    }
    if (bookToWriteOff.gt(acquisitionCost)) {
      bookToWriteOff = acquisitionCost;
    }
    const gainLoss = proceeds.minus(bookToWriteOff);

    const costCenterId = dto.costCenterId ?? asset.costCenterId ?? null;
    const thirdPartyId = dto.thirdPartyId ?? asset.thirdPartyId ?? null;

    const shouldPost = dto.postToAccounting === true;
    const counterpartyAccount = dto.counterpartyAccountCode?.trim() ?? null;
    const writeOffAccount = dto.writeOffAccountCode?.trim() ?? null;
    if (shouldPost && proceeds.gt(0) && !counterpartyAccount) {
      throw new BadRequestException(
        'Debe indicar la cuenta contable contrapartida para registrar la venta del activo',
      );
    }

    const metadata: Record<string, unknown> = {
      proceeds: Number(proceeds.toFixed(2)),
      gainLoss: Number(gainLoss.toFixed(2)),
      writeOffAccountCode: dto.writeOffAccountCode ?? null,
      carryingAmount: Number(bookToWriteOff.toFixed(2)),
      ...(dto.metadata ?? {}),
    };

    const description = dto.description ?? 'Baja de activo fijo';

    const result = await this.prisma.$transaction(async (tx) => {
      const movement = await tx.fixedAssetMovement.create({
        data: {
          assetId,
          type: FixedAssetMovementType.DISPOSAL,
          movementDate,
          amount: bookToWriteOff.toDecimalPlaces(2, DecimalCtor.ROUND_HALF_UP),
          bookValueAfter: new DecimalCtor(0),
          accumulatedAfter: acquisitionCost.minus(residualValue),
          description,
          costCenterId,
          thirdPartyId,
          metadata: metadata as Prisma.InputJsonValue,
          counterpartyAccountCode: counterpartyAccount,
          createdBy: dto.createdBy ?? null,
        },
      });

      const updatedAsset = await tx.fixedAsset.update({
        where: { id: assetId },
        data: {
          status: FixedAssetStatus.DISPOSED,
          disposedAt: movementDate,
          bookValue: new DecimalCtor(0),
          accumulatedDepreciation: acquisitionCost.minus(residualValue),
          lastDepreciatedYear: movementDate.getFullYear(),
          lastDepreciatedMonth: movementDate.getMonth() + 1,
        },
        include: {
          category: true,
          costCenter: true,
          thirdParty: true,
          locationRef: true,
          policy: true,
        },
      });

      let journalEntryId: number | null = null;
      if (shouldPost) {
        const assetAccount = this.ensureAccount(
          asset.category.assetAccountCode,
          'La categoría no tiene cuenta contable de activo',
        );
        const accumulatedAccount = this.ensureAccount(
          asset.category.accumulatedDepreciationAccountCode,
          'La categoría no tiene cuenta de depreciación acumulada',
        );

        const amountCost = Number(acquisitionCost.toFixed(2));
        const accumulatedClamped = DecimalCtor.min(
          accumulated,
          acquisitionCost,
        );
        const accumulatedAmount = Number(
          accumulatedClamped
            .toDecimalPlaces(2, DecimalCtor.ROUND_HALF_UP)
            .toFixed(2),
        );
        const proceedsAmount = Number(proceeds.toFixed(2));
        const gainLossAmount = Number(gainLoss.toFixed(2));

        const lines: AccountingLineInput[] = [
          {
            accountCode: assetAccount,
            credit: amountCost,
            costCenterId: costCenterId ?? undefined,
            thirdPartyId: thirdPartyId ?? undefined,
            description,
          },
        ];

        if (accumulatedAmount > 0) {
          lines.push({
            accountCode: accumulatedAccount,
            debit: accumulatedAmount,
            costCenterId: costCenterId ?? undefined,
            thirdPartyId: thirdPartyId ?? undefined,
            description,
          });
        }

        if (proceedsAmount > 0) {
          const proceedsAccount = this.ensureAccount(
            counterpartyAccount,
            'Debe indicar la cuenta contable contrapartida para registrar la venta del activo',
          );
          lines.push({
            accountCode: proceedsAccount,
            debit: proceedsAmount,
            costCenterId: costCenterId ?? undefined,
            thirdPartyId: thirdPartyId ?? undefined,
            description,
          });
        }

        const roundingTolerance = 0.005;
        if (gainLossAmount > roundingTolerance) {
          const gainAccount = this.ensureAccount(
            asset.category.disposalGainAccountCode,
            'La categoría no tiene cuenta para registrar la ganancia por la baja del activo',
          );
          lines.push({
            accountCode: gainAccount,
            credit: gainLossAmount,
            costCenterId: costCenterId ?? undefined,
            thirdPartyId: thirdPartyId ?? undefined,
            description,
          });
        } else if (gainLossAmount < -roundingTolerance) {
          const lossAccount = this.ensureAccount(
            writeOffAccount ?? asset.category.disposalLossAccountCode,
            'Debe indicar la cuenta para registrar la pérdida por la baja del activo',
          );
          lines.push({
            accountCode: lossAccount,
            debit: Number(Math.abs(gainLossAmount).toFixed(2)),
            costCenterId: costCenterId ?? undefined,
            thirdPartyId: thirdPartyId ?? undefined,
            description,
          });
        }

        const entry = await this.accounting.createEntryWithExistingTransaction(
          tx,
          {
            date: movementDate,
            sourceType: 'FIXED_ASSET_DISPOSAL',
            sourceId: movement.id,
            description,
            lines,
          },
        );
        journalEntryId = entry.id;
        await tx.fixedAssetMovement.update({
          where: { id: movement.id },
          data: { journalEntryId: entry.id },
        });
      }

      return { updatedAsset, journalEntryId };
    });

    return {
      asset: this.mapAsset(result.updatedAsset),
      proceeds: Number(proceeds.toFixed(2)),
      writtenOff: Number(bookToWriteOff.toFixed(2)),
      gainOrLoss: Number(gainLoss.toFixed(2)),
      lastJournalEntryId: result.journalEntryId ?? null,
    };
  }

  async previewSchedule(assetId: number, months = 12) {
    const asset = await this.prisma.fixedAsset.findUnique({
      where: { id: assetId },
      include: { category: true },
    });
    if (!asset) throw new NotFoundException('Activo fijo no encontrado');

    const schedule = this.buildSchedule(asset, months);
    return { asset: this.mapAsset(asset), schedule };
  }

  async runDepreciation(dto: RunDepreciationDto) {
    const shouldPost = dto.postToAccounting === true;

    const periodEnd = new Date(dto.year, dto.month, 0, 23, 59, 59, 999);

    const candidates = await this.prisma.fixedAsset.findMany({
      where: {
        depreciationMethod: { not: DepreciationMethod.NONE },
        status: dto.includeInactive ? undefined : FixedAssetStatus.ACTIVE,
        depreciationStart: { lte: periodEnd },
      },
      include: { category: true },
    });

    const assetMap = new Map<number, FixedAssetWithCategory>();
    for (const asset of candidates) {
      assetMap.set(asset.id, asset);
    }

    const plan = this.buildDepreciationPlan(candidates, dto.year, dto.month);
    if (!plan.entries.length) {
      return {
        period: { year: dto.year, month: dto.month },
        dryRun: dto.dryRun ?? false,
        totals: { assets: 0, amount: 0 },
        entries: [],
      };
    }

    if (dto.dryRun) {
      return {
        period: { year: dto.year, month: dto.month },
        dryRun: true,
        totals: plan.totals,
        entries: plan.entries,
      };
    }

    const existing = await this.prisma.fixedAssetDepreciationRun.findUnique({
      where: {
        periodYear_periodMonth: {
          periodYear: dto.year,
          periodMonth: dto.month,
        },
      },
    });
    if (existing && !dto.allowRepeat) {
      throw new BadRequestException('Ya existe una ejecución para el período');
    }

    return this.prisma.$transaction(async (tx) => {
      let runId: number;
      if (existing) {
        await tx.fixedAssetMovement.deleteMany({
          where: { depreciationRunId: existing.id },
        });
        runId = existing.id;
        await tx.fixedAssetDepreciationRun.update({
          where: { id: existing.id },
          data: {
            status: DepreciationRunStatus.SCHEDULED,
            executedAt: null,
            totalAssets: 0,
            totalAmount: new DecimalCtor(0),
          },
        });
      } else {
        const created = await tx.fixedAssetDepreciationRun.create({
          data: {
            periodYear: dto.year,
            periodMonth: dto.month,
            autoScheduled: dto.autoSchedule ?? false,
            status: DepreciationRunStatus.SCHEDULED,
          },
        });
        runId = created.id;
      }

      const impactedAssets = new Set<number>();
      let totalAmount = new DecimalCtor(0);

      for (const entry of plan.entries) {
        const assetRef = assetMap.get(entry.assetId);
        if (!assetRef) {
          throw new Error(
            `Invariant: activo ${entry.assetId} no encontrado durante depreciación`,
          );
        }

        const movementDate = new Date(
          entry.year,
          entry.month - 1,
          entry.day ?? 1,
        );

        const movement = await tx.fixedAssetMovement.create({
          data: {
            assetId: entry.assetId,
            depreciationRunId: runId,
            type: FixedAssetMovementType.DEPRECIATION,
            movementDate,
            amount: new DecimalCtor(entry.amount),
            bookValueAfter: new DecimalCtor(entry.bookValueAfter),
            accumulatedAfter: new DecimalCtor(entry.accumulatedAfter),
            description: entry.description,
            costCenterId: assetRef.costCenterId ?? null,
            thirdPartyId: assetRef.thirdPartyId ?? null,
            counterpartyAccountCode: shouldPost
              ? (assetRef.category.depreciationExpenseAccountCode ?? null)
              : null,
          },
        });

        await tx.fixedAsset.update({
          where: { id: entry.assetId },
          data: {
            accumulatedDepreciation: new DecimalCtor(entry.accumulatedAfter),
            bookValue: new DecimalCtor(entry.bookValueAfter),
            lastDepreciatedYear: entry.year,
            lastDepreciatedMonth: entry.month,
            status: entry.statusAfter ?? undefined,
          },
        });

        totalAmount = totalAmount.plus(entry.amount);
        impactedAssets.add(entry.assetId);

        if (shouldPost) {
          const expenseAccount = this.ensureAccount(
            assetRef.category.depreciationExpenseAccountCode,
            'La categoría no tiene cuenta para la depreciación en resultados',
          );
          const accumulatedAccount = this.ensureAccount(
            assetRef.category.accumulatedDepreciationAccountCode,
            'La categoría no tiene cuenta de depreciación acumulada',
          );
          const amountNumber = Number(entry.amount.toFixed(2));
          const entryRecord =
            await this.accounting.createEntryWithExistingTransaction(tx, {
              date: movementDate,
              sourceType: 'FIXED_ASSET_DEPRECIATION',
              sourceId: movement.id,
              description: entry.description,
              lines: [
                {
                  accountCode: expenseAccount,
                  debit: amountNumber,
                  costCenterId: assetRef.costCenterId ?? undefined,
                  thirdPartyId: assetRef.thirdPartyId ?? undefined,
                  description: entry.description,
                },
                {
                  accountCode: accumulatedAccount,
                  credit: amountNumber,
                  costCenterId: assetRef.costCenterId ?? undefined,
                  thirdPartyId: assetRef.thirdPartyId ?? undefined,
                  description: entry.description,
                },
              ],
            });
          await tx.fixedAssetMovement.update({
            where: { id: movement.id },
            data: { journalEntryId: entryRecord.id },
          });
        }
      }

      await tx.fixedAssetDepreciationRun.update({
        where: { id: runId },
        data: {
          status: DepreciationRunStatus.POSTED,
          executedAt: new Date(),
          totalAssets: impactedAssets.size,
          totalAmount,
        },
      });

      const totals = {
        assets: impactedAssets.size,
        amount: Number(totalAmount.toFixed(2)),
      };

      return {
        period: { year: dto.year, month: dto.month },
        dryRun: false,
        totals,
        entries: plan.entries,
      };
    });
  }

  private ensureAccount(code: string | null | undefined, message: string) {
    const value = code?.trim();
    if (!value) {
      throw new BadRequestException(message);
    }
    return value;
  }

  private mapAsset(
    asset: FixedAsset & {
      category?: FixedAssetCategory | null;
      locationRef?: FixedAssetLocation | null;
      policy?: FixedAssetPolicy | null;
    },
  ) {
    if (!asset.category) {
      throw new Error('Invariant: activo fijo sin categoría asociada');
    }
    const policy = asset.policy ? this.mapPolicy(asset.policy) : null;
    const location = asset.locationRef
      ? {
          id: asset.locationRef.id,
          code: asset.locationRef.code,
          name: asset.locationRef.name,
          description: asset.locationRef.description,
          parentId: asset.locationRef.parentId ?? null,
        }
      : null;
    return {
      ...asset,
      acquisitionCost: this.toNumber(asset.acquisitionCost),
      residualValue: this.toNumber(asset.residualValue),
      accumulatedDepreciation: this.toNumber(asset.accumulatedDepreciation),
      bookValue: this.toNumber(asset.bookValue),
      decliningBalanceRate: asset.decliningBalanceRate
        ? Number(new DecimalCtor(asset.decliningBalanceRate).toFixed(4))
        : null,
      locationRef: location,
      category: this.mapCategory(asset.category),
      policy,
    };
  }

  private mapCategory(category: FixedAssetCategory) {
    return {
      id: category.id,
      code: category.code,
      name: category.name,
      description: category.description,
      depreciationMethod: category.depreciationMethod,
      usefulLifeMonths: category.usefulLifeMonths,
      residualRate:
        category.residualRate != null
          ? this.toNumber(category.residualRate)
          : null,
      assetAccountCode: category.assetAccountCode,
      accumulatedDepreciationAccountCode:
        category.accumulatedDepreciationAccountCode,
      depreciationExpenseAccountCode: category.depreciationExpenseAccountCode,
      disposalGainAccountCode: category.disposalGainAccountCode,
      disposalLossAccountCode: category.disposalLossAccountCode,
      impairmentAccountCode: category.impairmentAccountCode,
      defaultCostCenterId: category.defaultCostCenterId,
      notes: category.notes,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };
  }

  private mapLocation(
    location: FixedAssetLocation & {
      children?: FixedAssetLocation[];
      parent?: FixedAssetLocation | null;
    },
  ): LocationView {
    return {
      id: location.id,
      code: location.code,
      name: location.name,
      description: location.description,
      isActive: location.isActive,
      notes: location.notes,
      parentId: location.parentId ?? null,
      parent: location.parent
        ? {
            id: location.parent.id,
            code: location.parent.code,
            name: location.parent.name,
          }
        : null,
      createdAt: location.createdAt,
      updatedAt: location.updatedAt,
      children:
        location.children?.map((child) => this.mapLocation(child)) ?? [],
    };
  }

  private mapPolicy(policy: FixedAssetPolicy) {
    return {
      id: policy.id,
      provider: policy.provider,
      policyNumber: policy.policyNumber,
      coverageSummary: policy.coverageSummary,
      startDate: policy.startDate,
      endDate: policy.endDate,
      premium: policy.premium != null ? this.toNumber(policy.premium) : null,
      currencyCode: policy.currencyCode,
      contactName: policy.contactName,
      contactEmail: policy.contactEmail,
      contactPhone: policy.contactPhone,
      notes: policy.notes,
      isActive: policy.isActive,
      createdAt: policy.createdAt,
      updatedAt: policy.updatedAt,
    };
  }

  private parseDateOrThrow(value: string | undefined, fieldName: string) {
    if (value == null) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Fecha inválida para ${fieldName}`);
    }
    return date;
  }

  private resolveMethod(
    method: string | undefined,
    category: FixedAssetCategory,
  ): DepreciationMethod {
    if (method) {
      if (!DEPRECIATION_METHOD_VALUES.includes(method as any)) {
        throw new BadRequestException('Método de depreciación inválido');
      }
      return method as DepreciationMethod;
    }
    return category.depreciationMethod;
  }

  private resolveResidualValue(
    dto: CreateFixedAssetDto,
    category: FixedAssetCategory,
    acquisitionCost: Prisma.Decimal,
  ) {
    if (dto.residualValue != null) {
      return new DecimalCtor(dto.residualValue);
    }
    if (category.residualRate != null) {
      const rate = new DecimalCtor(category.residualRate);
      return acquisitionCost
        .mul(rate)
        .div(100)
        .toDecimalPlaces(2, DecimalCtor.ROUND_HALF_UP);
    }
    return new DecimalCtor(0);
  }

  private resolveDecliningRate(
    dto: CreateFixedAssetDto,
    method: DepreciationMethod,
  ) {
    if (method !== DepreciationMethod.DECLINING_BALANCE) return null;
    if (dto.decliningBalanceRate == null) {
      throw new BadRequestException(
        'Debe definir una tasa para saldo decreciente',
      );
    }
    if (dto.decliningBalanceRate <= 0 || dto.decliningBalanceRate >= 1) {
      throw new BadRequestException('La tasa debe estar entre 0 y 1');
    }
    return new DecimalCtor(dto.decliningBalanceRate);
  }

  private async generateCode(
    tx: Prisma.TransactionClient,
    category: FixedAssetCategory,
  ) {
    const prefix = category.code || 'FA';
    const last = await tx.fixedAsset.findFirst({
      where: { code: { startsWith: `${prefix}-` } },
      orderBy: { code: 'desc' },
    });
    const nextNumber = this.extractSequence(last?.code) + 1;
    return `${prefix}-${String(nextNumber).padStart(4, '0')}`;
  }

  private extractSequence(code: string | null | undefined) {
    if (!code) return 0;
    const match = code.match(/-(\d+)$/);
    if (!match) return 0;
    return Number.parseInt(match[1], 10) || 0;
  }

  private toNumber(value: Decimalish) {
    if (value == null) return 0;
    if (value instanceof DecimalCtor) return Number(value.toFixed(2));
    if (typeof value === 'number') return value;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private buildSchedule(asset: FixedAssetWithCategory, months: number) {
    const plan = this.buildDepreciationPlan(
      [asset],
      asset.depreciationStart?.getFullYear() ?? new Date().getFullYear(),
      asset.depreciationStart?.getMonth() != null
        ? asset.depreciationStart.getMonth() + 1
        : new Date().getMonth() + 1,
      months,
    );
    return plan.entries.map((entry) => ({
      year: entry.year,
      month: entry.month,
      amount: entry.amount,
      accumulated: entry.accumulatedAfter,
      bookValue: entry.bookValueAfter,
      statusAfter: entry.statusAfter ?? null,
    }));
  }

  private buildDepreciationPlan(
    assets: FixedAssetWithCategory[],
    year: number,
    month: number,
    horizon = 1,
  ) {
    const entries: Array<{
      assetId: number;
      year: number;
      month: number;
      day?: number;
      amount: number;
      accumulatedAfter: number;
      bookValueAfter: number;
      description: string;
      residualValue: number;
      statusAfter?: FixedAssetStatus;
    }> = [];

    let totalAmount = new DecimalCtor(0);
    const periods = this.expandPeriods(year, month, horizon);

    for (const asset of assets) {
      const depreciationStart =
        asset.depreciationStart ?? asset.acquisitionDate;
      const startIndex = this.periodIndex(
        depreciationStart.getFullYear(),
        depreciationStart.getMonth() + 1,
      );
      const lifeEndIndex = startIndex + asset.usefulLifeMonths - 1;
      const lastIndex = this.lastDepreciatedIndex(asset) ?? startIndex - 1;

      const base = new DecimalCtor(asset.acquisitionCost).minus(
        new DecimalCtor(asset.residualValue ?? 0),
      );
      if (base.lte(0)) continue;

      let accumulated = new DecimalCtor(asset.accumulatedDepreciation ?? 0);
      let bookValue = new DecimalCtor(asset.bookValue ?? base);
      let pending = base.minus(accumulated);
      if (pending.lte(0)) continue;

      const monthlyStraight = base
        .div(asset.usefulLifeMonths)
        .toDecimalPlaces(2, DecimalCtor.ROUND_HALF_UP);
      const decliningRate = this.resolveDecliningRateFromAsset(asset);
      const residual = new DecimalCtor(asset.residualValue ?? 0);

      for (const period of periods) {
        if (period.index < startIndex) continue;
        if (period.index > lifeEndIndex) break;
        if (period.index <= lastIndex) continue;
        if (pending.lte(0)) break;

        let amount: Prisma.Decimal;
        switch (asset.depreciationMethod) {
          case DepreciationMethod.DECLINING_BALANCE: {
            if (!decliningRate || decliningRate.lte(0)) continue;
            amount = bookValue
              .mul(decliningRate)
              .div(12)
              .toDecimalPlaces(2, DecimalCtor.ROUND_HALF_UP);
            break;
          }
          case DepreciationMethod.NONE:
            continue;
          case DepreciationMethod.STRAIGHT_LINE:
          default: {
            amount = monthlyStraight;
            break;
          }
        }

        if (amount.lte(0)) continue;
        if (amount.gt(pending)) {
          amount = pending.toDecimalPlaces(2, DecimalCtor.ROUND_HALF_UP);
        }
        if (amount.lte(0)) continue;

        accumulated = accumulated.plus(amount);
        pending = base.minus(accumulated);
        bookValue = bookValue.minus(amount);

        const accumulatedNumber = Number(accumulated.toFixed(2));
        const bookValueNumber = Number(bookValue.toFixed(2));
        const amountNumber = Number(amount.toFixed(2));
        const statusAfter = pending.lte(0.01)
          ? FixedAssetStatus.INACTIVE
          : undefined;

        entries.push({
          assetId: asset.id,
          year: period.year,
          month: period.month,
          amount: amountNumber,
          accumulatedAfter: accumulatedNumber,
          bookValueAfter: bookValueNumber,
          description: `Depreciación ${period.year}-${String(period.month).padStart(2, '0')}`,
          residualValue: Number(residual.toFixed(2)),
          statusAfter,
        });

        totalAmount = totalAmount.plus(amount);
      }
    }

    const distinctAssets = new Set(entries.map((entry) => entry.assetId)).size;

    return {
      entries,
      totals: {
        assets: distinctAssets,
        amount: Number(totalAmount.toFixed(2)),
      },
    };
  }

  private resolveDecliningRateFromAsset(asset: FixedAsset) {
    if (asset.depreciationMethod !== DepreciationMethod.DECLINING_BALANCE) {
      return null;
    }
    if (!asset.decliningBalanceRate) return null;
    return new DecimalCtor(asset.decliningBalanceRate);
  }

  private expandPeriods(year: number, month: number, horizon: number) {
    const periods: Array<{ year: number; month: number; index: number }> = [];
    let currentYear = year;
    let currentMonth = month;

    for (let i = 0; i < Math.max(horizon, 1); i += 1) {
      const index = this.periodIndex(currentYear, currentMonth);
      periods.push({ year: currentYear, month: currentMonth, index });

      currentMonth += 1;
      if (currentMonth > 12) {
        currentMonth = 1;
        currentYear += 1;
      }
    }

    return periods;
  }

  private monthDiff(start: Date, end: Date) {
    return (
      (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth())
    );
  }

  private monthsDiff(start: Date, end: Date) {
    return this.monthDiff(start, end);
  }

  private periodIndex(year: number, month: number) {
    return year * 12 + (month - 1);
  }

  private lastDepreciatedIndex(asset: FixedAsset) {
    if (!asset.lastDepreciatedYear || !asset.lastDepreciatedMonth) return null;
    return this.periodIndex(
      asset.lastDepreciatedYear,
      asset.lastDepreciatedMonth,
    );
  }
}
