// api/src/accounting/__tests__/books.spec.ts
import { AccountingService } from '../accounting.service';

// Pequeño mock de PrismaService con solo lo que usa buildBook/salesBook/purchaseBook
function makePrismaMock(opts: { sales?: any[]; purchases?: any[] }) {
  return {
    // Solo estos dos métodos son utilizados en buildBook(...)
    salesInvoice: {
      findMany: jest.fn().mockResolvedValue(opts.sales ?? []),
    },
    purchaseInvoice: {
      findMany: jest.fn().mockResolvedValue(opts.purchases ?? []),
    },
  } as any;
}

const d = (s: string) => new Date(s);

// Helpers para armar facturas con la forma mínima que requiere el servicio
function mkSale(inv: Partial<any> = {}) {
  return {
    id: inv.id ?? 1,
    number: inv.number ?? 'S-001',
    issueDate: inv.issueDate ?? d('2025-01-10'),
    status: inv.status ?? 'ISSUED',
    thirdPartyId: inv.thirdPartyId ?? 10,
    thirdParty: inv.thirdParty ?? { id: 10, name: 'Cliente XYZ' },
    subtotal: inv.subtotal ?? 0,
    total: inv.total ?? 0,
    taxes: inv.taxes ?? [],
    withholdings: inv.withholdings ?? [],
  };
}

function mkPurchase(inv: Partial<any> = {}) {
  return {
    id: inv.id ?? 1,
    number: inv.number ?? 'P-001',
    issueDate: inv.issueDate ?? d('2025-01-11'),
    status: inv.status ?? 'ISSUED',
    thirdPartyId: inv.thirdPartyId ?? 20,
    thirdParty: inv.thirdParty ?? { id: 20, name: 'Proveedor ABC' },
    subtotal: inv.subtotal ?? 0,
    total: inv.total ?? 0,
    taxes: inv.taxes ?? [],
    withholdings: inv.withholdings ?? [],
  };
}

describe('AccountingService - Libros de ventas/compras', () => {
  const from = '2025-01-01';
  const to = '2025-01-31';

  test('ventas: tasas mixtas + retenciones (group=invoice)', async () => {
    // Factura A: base 100, IVA 19 = 19, total 119, retención 2
    const A = mkSale({
      id: 1,
      number: 'S-001',
      issueDate: d('2025-01-10'),
      subtotal: 100,
      total: 119,
      taxes: [{ ratePct: 19, base: 100, amount: 19 }],
      withholdings: [{ type: 'RTF', amount: 2 }],
    });
    // Factura B: base 200, IVA 5 = 10, total 210, sin retención
    const B = mkSale({
      id: 2,
      number: 'S-002',
      issueDate: d('2025-01-12'),
      subtotal: 200,
      total: 210,
      taxes: [{ ratePct: 5, base: 200, amount: 10 }],
    });

    const prisma = makePrismaMock({ sales: [A, B] });
    const svc = new AccountingService(prisma, {} as any);

    const r = await svc.salesBook(from, to, 'invoice');
    expect(r.group).toBe('invoice');
    expect(r.rows.length).toBe(2);

    // Fila A
    const rowA = r.rows[0];
    expect(rowA.taxBase).toBe(100);
    expect(rowA.vatByRate.vat_19).toBe(19);
    expect(rowA.vatByRate.vat_5 ?? 0).toBe(0);
    expect(rowA.withholdings).toBe(2);
    expect(rowA.total).toBe(119);

    // Fila B
    const rowB = r.rows[1];
    expect(rowB.taxBase).toBe(200);
    expect(rowB.vatByRate.vat_5).toBe(10);
    expect(rowB.withholdings).toBe(0);
    expect(rowB.total).toBe(210);

    // Totales
    expect(r.totals.taxBase).toBe(300);
    expect(r.totals.vatByRate.vat_19).toBe(19);
    expect(r.totals.vatByRate.vat_5).toBe(10);
    expect(r.totals.withholdings).toBe(2);
    expect(r.totals.total).toBe(329);
  });

  test('ventas: agrupación por día (group=day) suma bases, IVA por tasa y retenciones', async () => {
    // Dos facturas el mismo día
    const S1 = mkSale({
      id: 1,
      number: 'S-010',
      issueDate: d('2025-01-15'),
      subtotal: 100,
      total: 119,
      taxes: [{ ratePct: 19, base: 100, amount: 19 }],
      withholdings: [{ type: 'RTF', amount: 1 }],
    });
    const S2 = mkSale({
      id: 2,
      number: 'S-011',
      issueDate: d('2025-01-15'),
      subtotal: 200,
      total: 210,
      taxes: [{ ratePct: 5, base: 200, amount: 10 }],
      withholdings: [{ type: 'RTF', amount: 2 }],
    });
    const prisma = makePrismaMock({ sales: [S1, S2] });
    const svc = new AccountingService(prisma, {} as any);

    const r = await svc.salesBook(from, to, 'day');
    expect(r.group).toBe('day');
    expect(r.rows.length).toBe(1);

    const row = r.rows[0];
    expect(row.date).toBe('2025-01-15');
    expect(row.taxBase).toBe(300);
    expect(row.vatByRate.vat_19).toBe(19);
    expect(row.vatByRate.vat_5).toBe(10);
    expect(row.withholdings).toBe(3);
    expect(row.total).toBe(329);

    // Totales = la misma única fila
    expect(r.totals.taxBase).toBe(300);
    expect(r.totals.vatByRate.vat_19).toBe(19);
    expect(r.totals.vatByRate.vat_5).toBe(10);
    expect(r.totals.withholdings).toBe(3);
    expect(r.totals.total).toBe(329);
  });

  test('ventas: NC (crédito) resta valores; anuladas/VOID no se incluyen', async () => {
    // Factura normal
    const normal = mkSale({
      id: 1,
      number: 'S-100',
      issueDate: d('2025-01-20'),
      subtotal: 100,
      total: 119,
      taxes: [{ ratePct: 19, base: 100, amount: 19 }],
    });
    // Nota crédito representada como montos negativos (mismo período)
    const nc = mkSale({
      id: 2,
      number: 'NC-101',
      issueDate: d('2025-01-21'),
      subtotal: -40,
      total: -47.6,
      taxes: [{ ratePct: 19, base: -40, amount: -7.6 }],
    });
    // Anulada: status distinto a ISSUED/PAID → excluida por el filtro
    const anulada = mkSale({
      id: 3,
      number: 'S-VOID',
      issueDate: d('2025-01-22'),
      subtotal: 999,
      total: 999,
      status: 'VOID',
      taxes: [],
    });

    const prisma = makePrismaMock({ sales: [normal, nc, anulada] });
    const svc = new AccountingService(prisma, {} as any);

    const r = await svc.salesBook(from, to, 'invoice');
    // Deben aparecer solo 2 filas (normal + NC). La anulada no entra.
    expect(r.rows.length).toBe(2);

    // Totales: base 100 + (-40) = 60 ; IVA 19 + (-7.6) = 11.4 ; total 119 + (-47.6) = 71.4
    expect(r.totals.taxBase).toBeCloseTo(60, 6);
    expect(r.totals.vatByRate.vat_19).toBeCloseTo(11.4, 6);
    expect(r.totals.total).toBeCloseTo(71.4, 6);
  });

  test('compras: tasas + retenciones practicadas', async () => {
    // Compra con IVA 19 sobre base 300 (57) total 357, retención practicada 10
    const C1 = mkPurchase({
      id: 11,
      number: 'P-200',
      issueDate: d('2025-01-18'),
      subtotal: 300,
      total: 357,
      taxes: [{ ratePct: 19, base: 300, amount: 57 }],
      withholdings: [{ type: 'RTF', amount: 10 }],
    });
    const prisma = makePrismaMock({ purchases: [C1] });
    const svc = new AccountingService(prisma, {} as any);

    const r = await svc.purchaseBook(from, to, 'invoice');
    expect(r.kind).toBe('PURCHASES');
    expect(r.rows.length).toBe(1);
    const row = r.rows[0];
    expect(row.taxBase).toBe(300);
    expect(row.vatByRate.vat_19).toBe(57);
    expect(row.withholdings).toBe(10);
    expect(row.total).toBe(357);

    expect(r.totals.taxBase).toBe(300);
    expect(r.totals.vatByRate.vat_19).toBe(57);
    expect(r.totals.withholdings).toBe(10);
    expect(r.totals.total).toBe(357);
  });
});
