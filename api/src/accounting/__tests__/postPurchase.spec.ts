import { AccountingService } from '../accounting.service';

// Construir un mock mínimo de Prisma para postPurchaseInvoice
function makePrismaMockForPurchase(inv: any) {
  return {
    purchaseInvoice: {
      findUnique: jest.fn().mockResolvedValue(inv),
    },
    // $transaction simple que ejecuta el callback con un tx dummy
    $transaction: async (cb: any) => {
      const tx = {
        // se pueden añadir mocks adicionales si createEntry los usa
        journalEntry: { create: jest.fn(), findUnique: jest.fn() },
        journalLine: { create: jest.fn(), findMany: jest.fn() },
      } as any;
      return cb(tx);
    },
    journalEntry: { findUnique: jest.fn() },
    journalLine: { findMany: jest.fn() },
  } as any;
}

describe('AccountingService.postPurchaseInvoice', () => {
  test('genera líneas contables correctas para una compra con IVA y retención', async () => {
    // Compra: subtotal 100, IVA 19, total 119, retención RTF 5
    const purchase = {
      id: 42,
      number: 'P-042',
      issueDate: new Date('2025-10-01'),
      status: 'ISSUED',
      paymentType: 'CASH',
      thirdPartyId: 7,
      subtotal: 100,
      tax: 19,
      total: 119,
      lines: [{ itemId: 1, item: { type: 'PRODUCT' } }],
      withholdings: [{ type: 'RTF', amount: 5 }],
      thirdParty: { id: 7, name: 'Proveedor X' },
    } as any;

    const prisma = makePrismaMockForPurchase(purchase);

    // Crear servicio con prisma mock y un accountSettings vacío
    const accountSettingsMock = {
      getAccountCodeSync: (_k: string) => null as any,
      getAccountCode: async (_k: string) => null as any,
    };
    const svc: any = new AccountingService(prisma, accountSettingsMock as any);

    // Mockear helpers para devolver códigos contables previsibles
    svc.resolveExpenseOrCogsAccountCode = jest.fn().mockResolvedValue('6100');
    svc.resolveInventoryAccountCode = jest.fn().mockResolvedValue('1405');
    svc.resolvePayableAccountCode = jest.fn().mockResolvedValue('2205');
    // Cuando es CASH, el servicio debe preferir la cuenta de tesorería
    svc.resolveTreasuryAccountCode = jest.fn().mockResolvedValue('110505');
    svc.resolveWithholdingAccountCode = jest.fn().mockResolvedValue('2209');
    svc.calcVat = jest
      .fn()
      .mockResolvedValue({ amount: 19, accountCode: '2408' });
    svc.assertOpenPeriod = jest.fn().mockResolvedValue(undefined);

    // Interceptar la creación de asiento para inspeccionar las líneas
    const createEntryMock = jest.fn().mockResolvedValue({ id: 1 });
    svc.createEntry = createEntryMock;

    await svc.postPurchaseInvoice(purchase.id);

    expect(prisma.purchaseInvoice.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: purchase.id } }),
    );

    // Verificar que createEntry fue llamado y que las líneas contienen los códigos y montos esperados
    expect(createEntryMock).toHaveBeenCalledTimes(1);
    const params =
      createEntryMock.mock.calls[0][1] || createEntryMock.mock.calls[0][0];
    expect(params).toBeDefined();
    const lines = params.lines || [];

    // Debe contener: débito a inventario/gasto por subtotal
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountCode: expect.stringMatching(/^(1405|6100)$/),
          debit: 100,
        }),
      ]),
    );

    // Debe contener: débito a IVA por impuesto
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountCode: '2408', debit: 19 }),
      ]),
    );

    // Debe contener: crédito a tesorería (110505) por total - retenciones (119 - 5 = 114) porque fue CASH
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountCode: '110505', credit: 114 }),
      ]),
    );

    // Debe contener: crédito a cuenta de retención por 5
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountCode: '2209', credit: 5 }),
      ]),
    );
  });
});
