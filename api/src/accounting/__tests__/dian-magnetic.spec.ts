import { BadRequestException } from '@nestjs/common';
import { AccountingService } from '../accounting.service';
import type { PrismaService } from '../../prisma/prisma.service';

describe('AccountingService.dianMagneticTemplate', () => {
  const buildService = (overrides?: {
    purchaseInvoices?: any[];
    withholdings?: any[];
  }) => {
    const purchaseInvoices = overrides?.purchaseInvoices ?? [];
    const withholdings = overrides?.withholdings ?? [];

    const purchaseFindMany = jest.fn().mockResolvedValue(purchaseInvoices);
    const withholdingFindMany = jest.fn().mockResolvedValue(withholdings);

    const prismaMock = {
      purchaseInvoice: {
        findMany: purchaseFindMany,
      },
      invoiceWithholding: {
        findMany: withholdingFindMany,
      },
    } as unknown as PrismaService;

    const service = new AccountingService(prismaMock as any, {} as any);
    return {
      service,
      purchaseFindMany,
      withholdingFindMany,
    };
  };

  it('defaults to full fiscal year and both formats when none provided', async () => {
    const { service, purchaseFindMany } = buildService({
      purchaseInvoices: [
        {
          id: 1,
          number: 'PI-1',
          issueDate: new Date('2024-02-15'),
          total: 1000,
          thirdPartyId: 10,
          thirdParty: {
            id: 10,
            name: 'Proveedor Uno',
            document: '900373912',
            idType: '31',
          },
          withholdings: [
            {
              amount: 50,
            },
          ],
        },
      ],
      withholdings: [
        {
          type: 'RET_FUENTE',
          base: 1000,
          amount: 25,
          ratePct: 2.5,
          purchaseInvoiceId: 1,
          purchaseInvoice: {
            id: 1,
            number: 'PI-1',
            issueDate: new Date('2024-02-15'),
            thirdPartyId: 10,
            thirdParty: {
              id: 10,
              name: 'Proveedor Uno',
              document: '900373912',
              idType: '31',
            },
          },
        },
      ],
    });

    const report = await service.dianMagneticTemplate({ year: 2024 });

    expect(purchaseFindMany).toHaveBeenCalledTimes(1);
    const purchaseCall = purchaseFindMany.mock.calls[0]?.[0];
    expect(purchaseCall?.where?.issueDate?.gte?.toISOString()).toBe(
      '2024-01-01T00:00:00.000Z',
    );
    expect(purchaseCall?.where?.issueDate?.lte?.toISOString()).toBe(
      '2024-12-31T23:59:59.999Z',
    );

    expect(report.year).toBe(2024);
    expect(report.from?.toISOString()).toBe('2024-01-01T00:00:00.000Z');
    expect(report.to?.toISOString()).toBe('2024-12-31T23:59:59.999Z');

    const format1001 = report.formats?.['1001'];
    expect(format1001?.totals).toEqual({
      amountPaid: 1000,
      retainedAmount: 50,
    });

    const format1003 = report.formats?.['1003'];
    expect(format1003?.totals).toEqual({
      baseAmount: 1000,
      withheldAmount: 25,
    });
  });

  it('rejects ranges outside the fiscal year', async () => {
    const { service } = buildService();

    await expect(
      service.dianMagneticTemplate({
        year: 2024,
        from: '2023-12-31',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.dianMagneticTemplate({
        year: 2024,
        to: '2025-01-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('respects explicit format filters', async () => {
    const { service, purchaseFindMany } = buildService({
      purchaseInvoices: [],
      withholdings: [],
    });

    const report = await service.dianMagneticTemplate({
      year: 2024,
      formats: ['1003'],
    });

    expect(purchaseFindMany).not.toHaveBeenCalled();
    expect(report.formats?.['1001']).toBeUndefined();
    expect(report.formats?.['1003']).toBeDefined();
  });
});
