import { AccountingService } from '../accounting.service';
import type { PrismaService } from '../../prisma/prisma.service';

const buildWithholdingService = (withholdings: any[] = []) => {
  const findMany = jest.fn().mockResolvedValue(withholdings);
  const prismaMock = {
    invoiceWithholding: {
      findMany,
    },
  } as unknown as PrismaService;

  const service = new AccountingService(prismaMock as any, {} as any);
  return { service, findMany };
};

describe('AccountingService DIAN regulatory templates', () => {
  describe('dianVatTemplate', () => {
    it('rounds values and merges totals from buildBook rows', async () => {
      const service = new AccountingService({} as PrismaService, {} as any);
      const buildBookSpy = jest
        .spyOn(service as any, 'buildBook')
        .mockResolvedValue({
          from: new Date('2024-01-01T00:00:00.000Z'),
          to: new Date('2024-01-31T00:00:00.000Z'),
          kind: 'SALES',
          group: 'invoice',
          rows: [
            {
              date: '2024-01-10',
              number: 'F-001',
              thirdPartyId: 1,
              thirdPartyDocument: '123456789',
              thirdPartyDv: '5',
              thirdPartyIdType: '13',
              thirdPartyName: 'Cliente Uno',
              taxBase: 1000,
              vatByRate: { vat_19: 190.125, vat_5: 50.005 },
              withholdings: 10.555,
              total: 1260.63,
            },
            {
              date: '2024-01-11',
              number: 'F-002',
              thirdPartyId: 2,
              thirdPartyDocument: '900123456',
              thirdPartyDv: '1',
              thirdPartyIdType: '31',
              thirdPartyName: 'Cliente Dos',
              taxBase: 500,
              vatByRate: { vat_19: 110 },
              withholdings: 0,
              total: 610.99,
            },
          ],
          totals: {
            taxBase: 1500,
            vatByRate: { vat_19: 300.125, vat_5: 50.005 },
            withholdings: 10.555,
            total: 1871.62,
          },
        });

      const report = await service.dianVatTemplate({ scope: 'PURCHASES' });

      expect(buildBookSpy).toHaveBeenCalledWith(
        'PURCHASES',
        undefined,
        undefined,
        'invoice',
      );
      expect(report.scope).toBe('PURCHASES');
      expect(report.rows).toHaveLength(2);

      const firstRow = report.rows[0];
      expect(firstRow.vatByRate).toEqual({ vat_19: 190.13, vat_5: 50.01 });
      expect(firstRow.vatTotal).toBe(240.13);
      expect(firstRow.withholdings).toBe(10.56);
      expect(firstRow.total).toBe(1260.63);

      expect(report.totals.taxBase).toBe(1500);
      expect(report.totals.vatTotal).toBe(350.13);
      expect(report.totals.withholdings).toBe(10.56);
      expect(report.totals.total).toBe(1871.62);
      expect(report.totals.vatByRate).toEqual({ vat_19: 300.13, vat_5: 50.01 });
    });
  });

  describe('dianWithholdingTemplate', () => {
    it('aggregates purchases withholdings and rounds totals', async () => {
      const { service, findMany } = buildWithholdingService([
        {
          id: 1,
          type: 'RTF',
          base: 1000.456,
          amount: 25.555,
          ratePct: 2.55555,
          ruleId: 77,
          rule: {
            ciiuCode: '1234',
            municipalityCode: '11001',
          },
          createdAt: new Date('2024-01-12T00:00:00.000Z'),
          purchaseInvoiceId: 10,
          purchaseInvoice: {
            id: 10,
            number: 'PI-10',
            issueDate: new Date('2024-01-10T00:00:00.000Z'),
            thirdPartyId: 88,
            thirdParty: {
              id: 88,
              name: 'Proveedor Uno',
              document: '900373912',
              idType: '31',
            },
          },
          salesInvoiceId: null,
          salesInvoice: null,
        },
        {
          id: 2,
          type: 'RIVA',
          base: 500,
          amount: 30.5,
          ratePct: 15,
          ruleId: null,
          rule: null,
          createdAt: new Date('2024-01-13T00:00:00.000Z'),
          purchaseInvoiceId: 11,
          purchaseInvoice: {
            id: 11,
            number: 'PI-11',
            issueDate: new Date('2024-01-11T00:00:00.000Z'),
            thirdPartyId: 90,
            thirdParty: {
              id: 90,
              name: 'Proveedor Dos',
              document: '800123456',
              idType: '31',
            },
          },
          salesInvoiceId: null,
          salesInvoice: null,
        },
      ]);

      const report = await service.dianWithholdingTemplate({
        scope: 'PURCHASES',
        from: '2024-01-01',
        to: '2024-01-31',
      });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            purchaseInvoiceId: { not: null },
          }),
        }),
      );

      expect(report.scope).toBe('PURCHASES');
      expect(report.rows).toHaveLength(2);

      const firstRow = report.rows[0];
      expect(firstRow.thirdPartyDv).toBe('1');
      expect(firstRow.ratePct).toBe(2.5556);
      expect(firstRow.base).toBe(1000.46);
      expect(firstRow.amount).toBe(25.56);

      expect(report.totals.base).toBe(1500.46);
      expect(report.totals.amount).toBe(56.06);
      expect(report.totals.byType?.RTF).toEqual({
        base: 1000.46,
        amount: 25.56,
      });
      expect(report.totals.byType?.RIVA).toEqual({ base: 500, amount: 30.5 });
    });

    it('applies type filter for sales scope', async () => {
      const { service, findMany } = buildWithholdingService([]);

      await service.dianWithholdingTemplate({
        scope: 'SALES',
        type: 'RTF',
      });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: 'RTF',
            salesInvoiceId: { not: null },
          }),
        }),
      );
    });
  });
});
