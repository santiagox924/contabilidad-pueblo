import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  DepreciationMethod,
  FixedAssetMovementType,
  FixedAssetStatus,
} from '@prisma/client';
import { FixedAssetsService } from '../fixed-assets.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountingService } from '../../accounting/accounting.service';

const Decimal = Prisma.Decimal;

const buildFixedAsset = (
  overrides: Partial<
    Prisma.FixedAssetGetPayload<{
      include: {
        category: true;
        costCenter: true;
        thirdParty: true;
        locationRef: true;
        policy: true;
      };
    }>
  > = {},
) => ({
  id: 1,
  code: 'FA-0001',
  name: 'Computador',
  categoryId: 9,
  category: {
    id: 9,
    code: 'COMP',
    name: 'Computadores',
    description: null,
    depreciationMethod: DepreciationMethod.STRAIGHT_LINE,
    usefulLifeMonths: 60,
    residualRate: new Decimal('5'),
    assetAccountCode: '150505',
    accumulatedDepreciationAccountCode: '159205',
    depreciationExpenseAccountCode: '529505',
    disposalGainAccountCode: null,
    disposalLossAccountCode: null,
    impairmentAccountCode: null,
    defaultCostCenterId: null,
    notes: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
  acquisitionDate: new Date('2024-01-01'),
  acquisitionCost: new Decimal('1000'),
  residualValue: new Decimal('100'),
  accumulatedDepreciation: new Decimal('200'),
  bookValue: new Decimal('800'),
  usefulLifeMonths: 60,
  depreciationMethod: DepreciationMethod.STRAIGHT_LINE,
  decliningBalanceRate: null,
  status: FixedAssetStatus.ACTIVE,
  depreciationStart: new Date('2024-02-01'),
  lastDepreciatedYear: 2024,
  lastDepreciatedMonth: 2,
  costCenterId: null,
  thirdPartyId: null,
  locationId: null,
  policyId: null,
  location: null,
  serialNumber: null,
  policyNumber: null,
  supportUrl: null,
  description: null,
  customFields: Prisma.JsonNull,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  disposedAt: null,
  costCenter: null,
  thirdParty: null,
  locationRef: null,
  policy: null,
  ...overrides,
});

const createPrismaMock = () => {
  const fixedAssetCategory = {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const fixedAssetLocation = {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  };

  const fixedAssetPolicy = {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const fixedAsset = {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  };

  const fixedAssetMovement = {
    create: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  };

  const fixedAssetDepreciationRun = {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };

  const mock: any = {
    fixedAssetCategory,
    fixedAssetLocation,
    fixedAssetPolicy,
    fixedAsset,
    fixedAssetMovement,
    fixedAssetDepreciationRun,
    $transaction: jest.fn(async (cb: any) => cb(mock)),
  };

  return mock;
};

describe('FixedAssetsService', () => {
  let service: FixedAssetsService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let accounting: { createEntryWithExistingTransaction: jest.Mock };

  beforeEach(async () => {
    prisma = createPrismaMock();
    accounting = {
      createEntryWithExistingTransaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FixedAssetsService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: AccountingService,
          useValue: accounting,
        },
      ],
    }).compile();

    service = module.get(FixedAssetsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('catalogs', () => {
    it('returns mapped categories with numeric residual', async () => {
      prisma.fixedAssetCategory.findMany.mockResolvedValue([
        {
          id: 9,
          code: 'COMP',
          name: 'Computadores',
          description: null,
          depreciationMethod: DepreciationMethod.STRAIGHT_LINE,
          usefulLifeMonths: 60,
          residualRate: new Decimal('5.5'),
          assetAccountCode: '150505',
          accumulatedDepreciationAccountCode: '159205',
          depreciationExpenseAccountCode: '529505',
          disposalGainAccountCode: null,
          disposalLossAccountCode: null,
          impairmentAccountCode: null,
          defaultCostCenterId: null,
          notes: null,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ]);

      const result = await service.listCategories();

      expect(result).toEqual([
        expect.objectContaining({
          code: 'COMP',
          residualRate: 5.5,
          depreciationMethod: DepreciationMethod.STRAIGHT_LINE,
        }),
      ]);
    });

    it('creates improvement when asset is active and updates totals', async () => {
      const asset = buildFixedAsset();
      prisma.fixedAsset.findUnique.mockResolvedValue(asset);

      const updatedAsset = buildFixedAsset({
        acquisitionCost: asset.acquisitionCost.plus(200),
        bookValue: asset.bookValue.plus(200),
      });
      prisma.fixedAsset.update.mockResolvedValue(updatedAsset);

      const movementSpy = prisma.fixedAssetMovement.create;

      const result = await service.registerImprovement(1, {
        amount: 200,
        movementDate: '2024-03-01',
        description: 'Mejora de equipo',
        extendLifeMonths: 6,
        residualIncrease: 10,
        createdBy: 'test-user',
      });

      expect(prisma.fixedAsset.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.fixedAsset.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            acquisitionCost: expect.any(Decimal),
            bookValue: expect.any(Decimal),
            usefulLifeMonths: asset.usefulLifeMonths + 6,
          }),
        }),
      );
      expect(movementSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: FixedAssetMovementType.IMPROVEMENT,
            createdBy: 'test-user',
            metadata: expect.objectContaining({
              extendLifeMonths: 6,
              residualIncrease: 10,
            }),
          }),
        }),
      );
      expect(
        accounting.createEntryWithExistingTransaction,
      ).not.toHaveBeenCalled();
      expect(result.bookValue).toBe(1000); // 800 + 200
    });

    it('posts improvement accounting entry when requested', async () => {
      const asset = buildFixedAsset();
      prisma.fixedAsset.findUnique.mockResolvedValue(asset);

      const updatedAsset = buildFixedAsset({
        acquisitionCost: asset.acquisitionCost.plus(100),
        bookValue: asset.bookValue.plus(100),
      });
      prisma.fixedAsset.update.mockResolvedValue(updatedAsset);
      prisma.fixedAssetMovement.create.mockResolvedValue({ id: 991 });
      prisma.fixedAssetMovement.update.mockResolvedValue({});
      accounting.createEntryWithExistingTransaction.mockResolvedValue({
        id: 412,
      });

      const result = await service.registerImprovement(1, {
        amount: 100,
        counterpartyAccountCode: '210505',
        postToAccounting: true,
      });

      expect(
        accounting.createEntryWithExistingTransaction,
      ).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          sourceType: 'FIXED_ASSET_IMPROVEMENT',
          sourceId: 991,
          lines: expect.arrayContaining([
            expect.objectContaining({ accountCode: '150505', debit: 100 }),
            expect.objectContaining({ accountCode: '210505', credit: 100 }),
          ]),
        }),
      );
      expect(prisma.fixedAssetMovement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 991 },
          data: { journalEntryId: 412 },
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({ lastJournalEntryId: 412 }),
      );
    });

    it('rejects improvements for disposed assets', async () => {
      prisma.fixedAsset.findUnique.mockResolvedValue(
        buildFixedAsset({ status: FixedAssetStatus.DISPOSED }),
      );

      await expect(
        service.registerImprovement(99, {
          amount: 100,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('disposes asset and computes gain/loss with metadata', async () => {
      const asset = buildFixedAsset({
        accumulatedDepreciation: new Decimal('400'),
        bookValue: new Decimal('600'),
      });
      prisma.fixedAsset.findUnique.mockResolvedValue(asset);

      const disposedAsset = buildFixedAsset({
        status: FixedAssetStatus.DISPOSED,
        bookValue: new Decimal('0'),
        accumulatedDepreciation: new Decimal('900'),
        disposedAt: new Date('2024-04-01'),
      });
      prisma.fixedAsset.update.mockResolvedValue(disposedAsset);

      const result = await service.disposeAsset(1, {
        movementDate: '2024-04-01',
        proceeds: 550,
        description: 'Venta',
        createdBy: 'user',
      });

      expect(prisma.fixedAssetMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: FixedAssetMovementType.DISPOSAL,
            metadata: expect.objectContaining({
              proceeds: 550,
              gainLoss: -50,
            }),
          }),
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          proceeds: 550,
          writtenOff: 600,
          gainOrLoss: -50,
        }),
      );
    });

    it('throws when asset does not exist', async () => {
      prisma.fixedAsset.findUnique.mockResolvedValue(null);

      await expect(
        service.registerImprovement(1, { amount: 100 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.disposeAsset(1, {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('accounting integration', () => {
    it('posts addition accounting entry when requested', async () => {
      const baseAsset = buildFixedAsset();
      const category = { ...baseAsset.category };
      prisma.fixedAssetCategory.findUnique.mockResolvedValue(category);

      const createdAsset = buildFixedAsset({
        id: 10,
        code: 'FA-0002',
        name: 'Servidor',
        acquisitionDate: new Date('2024-04-01'),
        acquisitionCost: new Decimal('1500'),
        residualValue: new Decimal('100'),
        bookValue: new Decimal('1400'),
        depreciationStart: new Date('2024-04-01'),
        category,
      });
      prisma.fixedAsset.create.mockResolvedValue(createdAsset);
      prisma.fixedAssetMovement.create.mockResolvedValue({ id: 501 });
      prisma.fixedAssetMovement.update.mockResolvedValue({});
      accounting.createEntryWithExistingTransaction.mockResolvedValue({
        id: 902,
      });

      const result = await service.create({
        code: 'FA-0002',
        name: 'Servidor',
        categoryId: category.id,
        acquisitionDate: '2024-04-01',
        acquisitionCost: 1500,
        residualValue: 100,
        depreciationStart: '2024-04-01',
        postToAccounting: true,
        counterpartyAccountCode: '230505',
      });

      expect(
        accounting.createEntryWithExistingTransaction,
      ).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          sourceType: 'FIXED_ASSET_ADDITION',
          sourceId: 501,
          lines: expect.arrayContaining([
            expect.objectContaining({ accountCode: '150505', debit: 1500 }),
            expect.objectContaining({ accountCode: '230505', credit: 1500 }),
          ]),
        }),
      );
      expect(prisma.fixedAssetMovement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 501 },
          data: { journalEntryId: 902 },
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({ code: 'FA-0002', lastJournalEntryId: 902 }),
      );
    });

    it('posts disposal accounting entry when requested', async () => {
      const baseAsset = buildFixedAsset();
      const category = {
        ...baseAsset.category,
        disposalGainAccountCode: '423505',
        disposalLossAccountCode: '619505',
      };
      const asset = {
        ...baseAsset,
        category,
        accumulatedDepreciation: new Decimal('400'),
        bookValue: new Decimal('600'),
      };
      prisma.fixedAsset.findUnique.mockResolvedValue(asset);

      const disposedAsset = {
        ...asset,
        status: FixedAssetStatus.DISPOSED,
        bookValue: new Decimal('0'),
        accumulatedDepreciation: new Decimal('900'),
      };
      prisma.fixedAssetMovement.create.mockResolvedValue({ id: 777 });
      prisma.fixedAsset.update.mockResolvedValue(disposedAsset as any);
      prisma.fixedAssetMovement.update.mockResolvedValue({});
      accounting.createEntryWithExistingTransaction.mockResolvedValue({
        id: 888,
      });

      const result = await service.disposeAsset(1, {
        movementDate: '2024-06-01',
        proceeds: 500,
        counterpartyAccountCode: '110505',
        writeOffAccountCode: '619505',
        postToAccounting: true,
      });

      expect(
        accounting.createEntryWithExistingTransaction,
      ).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          sourceType: 'FIXED_ASSET_DISPOSAL',
          sourceId: 777,
          lines: expect.arrayContaining([
            expect.objectContaining({ accountCode: '150505', credit: 1000 }),
            expect.objectContaining({ accountCode: '159205', debit: 400 }),
            expect.objectContaining({ accountCode: '110505', debit: 500 }),
            expect.objectContaining({ accountCode: '619505', debit: 100 }),
          ]),
        }),
      );
      expect(prisma.fixedAssetMovement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 777 },
          data: { journalEntryId: 888 },
        }),
      );
      expect(result.lastJournalEntryId).toBe(888);
    });

    it('posts depreciation accounting entry when requested', async () => {
      const asset = buildFixedAsset();
      prisma.fixedAsset.findMany.mockResolvedValue([asset]);
      prisma.fixedAssetDepreciationRun.findUnique.mockResolvedValue(null);
      prisma.fixedAssetDepreciationRun.create.mockResolvedValue({ id: 55 });
      prisma.fixedAssetMovement.create.mockResolvedValue({ id: 901 });
      prisma.fixedAsset.update.mockResolvedValue(asset as any);
      prisma.fixedAssetMovement.update.mockResolvedValue({});
      prisma.fixedAssetDepreciationRun.update.mockResolvedValue({});
      accounting.createEntryWithExistingTransaction.mockResolvedValue({
        id: 1001,
      });

      const result = await service.runDepreciation({
        year: 2024,
        month: 3,
        postToAccounting: true,
      });

      expect(
        accounting.createEntryWithExistingTransaction,
      ).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          sourceType: 'FIXED_ASSET_DEPRECIATION',
          sourceId: 901,
          lines: expect.arrayContaining([
            expect.objectContaining({ accountCode: '529505', debit: 15 }),
            expect.objectContaining({ accountCode: '159205', credit: 15 }),
          ]),
        }),
      );
      expect(prisma.fixedAssetMovement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 901 },
          data: { journalEntryId: 1001 },
        }),
      );
      expect(result.totals.amount).toBeGreaterThan(0);
    });
  });
});
