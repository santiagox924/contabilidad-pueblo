// api/src/accounting/exogena/templates/2024.ts
// Plantillas ejemplo DIAN 2024: 1001 (Compras), 1005 (IVA generado), 1006 (IVA descontable)
// Nota: Son "mapas" base y agregaciones típicas; ajusta columnas y reglas a tu realidad/DIAN.

import {
  ExogenaYearTemplate,
  ExogenaFormat,
  ExogenaField,
  ExogenaInput,
  MinimalInvoice,
  ThirdPartyInfo,
} from './types';
import { groupBy, resolveTaxId, sumBy, toNumber, safeUpper } from './utils';

type Ctx1001 = {
  tp: ThirdPartyInfo | undefined;
  nit: string;
  dv: string;
  name: string;
  /** Totales anuales por tercero (compras) */
  base: number;
  vat: number;
  wht: number;
  total: number;
};

type Ctx1005 = {
  tp: ThirdPartyInfo | undefined;
  nit: string;
  dv: string;
  name: string;
  /** IVA generado (ventas) por tercero */
  base: number;
  vat: number;
  total: number;
};

type Ctx1006 = {
  tp: ThirdPartyInfo | undefined;
  nit: string;
  dv: string;
  name: string;
  /** IVA descontable (compras) por tercero */
  base: number;
  vat: number;
  total: number;
};

function invoiceThirdParty(
  inv: MinimalInvoice,
  map?: Record<number, ThirdPartyInfo>,
) {
  const raw = inv.thirdParty ?? null;
  const enriched =
    inv.thirdPartyId != null ? map?.[inv.thirdPartyId] : undefined;
  const name = enriched?.name ?? raw?.name ?? '';
  const { nit, dv } = resolveTaxId(enriched ?? raw);
  return { name, nit, dv, tp: enriched };
}

function sumInvoiceTaxes(inv: MinimalInvoice) {
  let base = 0;
  let vat = 0;
  for (const t of inv.taxes ?? []) {
    base += toNumber(t.base);
    vat += toNumber(t.amount);
  }
  return { base: base > 0 ? base : toNumber(inv.subtotal), vat };
}

function sumInvoiceWithholdings(inv: MinimalInvoice) {
  let w = 0;
  for (const it of inv.withholdings ?? []) w += toNumber(it.amount);
  return w;
}

function build1001(): ExogenaFormat<Ctx1001> {
  const fields: ExogenaField<Ctx1001>[] = [
    {
      name: 'tipo_doc',
      title: 'Tipo documento DIAN',
      type: 'string',
      resolve: (r) => r.tp?.docType ?? '31',
    },
    {
      name: 'nit',
      title: 'NIT/Tercero',
      type: 'string',
      resolve: (r) => r.nit,
    },
    { name: 'dv', title: 'DV', type: 'string', resolve: (r) => r.dv },
    {
      name: 'nombre',
      title: 'Nombre/Razón social',
      type: 'string',
      resolve: (r) => safeUpper(r.name),
    },
    {
      name: 'base',
      title: 'Base (sin IVA)',
      type: 'number',
      decimals: 2,
      resolve: (r) => r.base,
    },
    {
      name: 'iva',
      title: 'IVA descontable',
      type: 'number',
      decimals: 2,
      resolve: (r) => r.vat,
    },
    {
      name: 'ret',
      title: 'Retenciones practicadas',
      type: 'number',
      decimals: 2,
      resolve: (r) => r.wht,
    },
    {
      name: 'total',
      title: 'Valor total',
      type: 'number',
      decimals: 2,
      resolve: (r) => r.total,
    },
  ];

  return {
    code: '1001',
    name: 'Pagos y abonos en cuenta (Compras y otros conceptos)',
    description:
      'Agregado anual por tercero (compras). Ajusta columnas según resolución DIAN del año.',
    fileName: ({ year }) => `1001_${year}`,
    fields,
    rowSource: (input: ExogenaInput) => {
      const rows: Ctx1001[] = [];
      const byTp = groupBy(
        input.purchases ?? [],
        (inv) => inv.thirdPartyId ?? inv.id,
      );
      for (const [, list] of byTp) {
        if (!list?.length) continue;
        const any = list[0];
        const { name, nit, dv, tp } = invoiceThirdParty(
          any,
          input.thirdParties,
        );
        const base = sumBy(list, (x) => sumInvoiceTaxes(x).base);
        const vat = sumBy(list, (x) => sumInvoiceTaxes(x).vat);
        const wht = sumBy(list, (x) => sumInvoiceWithholdings(x));
        const total = sumBy(list, (x) => toNumber(x.total));
        rows.push({ tp, name, nit, dv, base, vat, wht, total });
      }
      // Opcional: ordenar por NIT
      rows.sort((a, b) => a.nit.localeCompare(b.nit));
      return rows;
    },
  };
}

function build1005(): ExogenaFormat<Ctx1005> {
  const fields: ExogenaField<Ctx1005>[] = [
    {
      name: 'tipo_doc',
      title: 'Tipo documento',
      type: 'string',
      resolve: (r) => r.tp?.docType ?? '31',
    },
    {
      name: 'nit',
      title: 'NIT/Tercero',
      type: 'string',
      resolve: (r) => r.nit,
    },
    { name: 'dv', title: 'DV', type: 'string', resolve: (r) => r.dv },
    {
      name: 'nombre',
      title: 'Nombre',
      type: 'string',
      resolve: (r) => safeUpper(r.name),
    },
    {
      name: 'base',
      title: 'Base gravable',
      type: 'number',
      decimals: 2,
      resolve: (r) => r.base,
    },
    {
      name: 'iva',
      title: 'IVA generado',
      type: 'number',
      decimals: 2,
      resolve: (r) => r.vat,
    },
    {
      name: 'total',
      title: 'Total',
      type: 'number',
      decimals: 2,
      resolve: (r) => r.total,
    },
  ];

  return {
    code: '1005',
    name: 'Impuesto a las ventas (IVA) generado',
    description: 'Ventas con IVA por tercero (anual).',
    fileName: ({ year }) => `1005_${year}`,
    fields,
    rowSource: (input: ExogenaInput) => {
      const rows: Ctx1005[] = [];
      const byTp = groupBy(
        input.sales ?? [],
        (inv) => inv.thirdPartyId ?? inv.id,
      );
      for (const [, list] of byTp) {
        const any = list[0];
        const { name, nit, dv, tp } = invoiceThirdParty(
          any,
          input.thirdParties,
        );
        const base = sumBy(list, (x) => sumInvoiceTaxes(x).base);
        const vat = sumBy(list, (x) => sumInvoiceTaxes(x).vat);
        const total = sumBy(list, (x) => toNumber(x.total));
        rows.push({ tp, name, nit, dv, base, vat, total });
      }
      rows.sort((a, b) => a.nit.localeCompare(b.nit));
      return rows;
    },
  };
}

function build1006(): ExogenaFormat<Ctx1006> {
  const fields: ExogenaField<Ctx1006>[] = [
    {
      name: 'tipo_doc',
      title: 'Tipo documento',
      type: 'string',
      resolve: (r) => r.tp?.docType ?? '31',
    },
    {
      name: 'nit',
      title: 'NIT/Tercero',
      type: 'string',
      resolve: (r) => r.nit,
    },
    { name: 'dv', title: 'DV', type: 'string', resolve: (r) => r.dv },
    {
      name: 'nombre',
      title: 'Nombre/Razón',
      type: 'string',
      resolve: (r) => safeUpper(r.name),
    },
    {
      name: 'base',
      title: 'Base gravable',
      type: 'number',
      decimals: 2,
      resolve: (r) => r.base,
    },
    {
      name: 'iva',
      title: 'IVA descontable',
      type: 'number',
      decimals: 2,
      resolve: (r) => r.vat,
    },
    {
      name: 'total',
      title: 'Total compras',
      type: 'number',
      decimals: 2,
      resolve: (r) => r.total,
    },
  ];

  return {
    code: '1006',
    name: 'IVA descontable',
    description: 'Compras con IVA por tercero (anual).',
    fileName: ({ year }) => `1006_${year}`,
    fields,
    rowSource: (input: ExogenaInput) => {
      const rows: Ctx1006[] = [];
      const byTp = groupBy(
        input.purchases ?? [],
        (inv) => inv.thirdPartyId ?? inv.id,
      );
      for (const [, list] of byTp) {
        const any = list[0];
        const { name, nit, dv, tp } = invoiceThirdParty(
          any,
          input.thirdParties,
        );
        const base = sumBy(list, (x) => sumInvoiceTaxes(x).base);
        const vat = sumBy(list, (x) => sumInvoiceTaxes(x).vat);
        const total = sumBy(list, (x) => toNumber(x.total));
        rows.push({ tp, name, nit, dv, base, vat, total });
      }
      rows.sort((a, b) => a.nit.localeCompare(b.nit));
      return rows;
    },
  };
}

export const Template2024: ExogenaYearTemplate = {
  year: 2024,
  formats: {
    '1001': build1001(),
    '1005': build1005(),
    '1006': build1006(),
  },
};
