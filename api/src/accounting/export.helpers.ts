// api/src/accounting/export.helpers.ts

/**
 * Utilidades para exportaciones CSV y “aplanar” IVA por tasa.
 * - Convierte mapas { vat_19: 123, vat_5: 45 } a columnas fijas.
 * - Formatea números de forma consistente (2 decimales por defecto).
 * - Genera CSV con escape correcto de comillas, comas y saltos de línea.
 */

export type VatByRate = Record<string | number, number>;

export type BookLikeRow = {
  date: string | Date;
  number?: string | number;
  thirdPartyId?: number | string;
  thirdPartyName?: string;
  taxBase: number;
  vatByRate: VatByRate;
  withholdings?: number;
  total: number;
};

const isNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/** YYYY-MM-DD a partir de Date o string ISO/fecha YYYY-MM-DD */
export function formatDateISO(d: string | Date): string {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  // Si ya viene en YYYY-MM-DD/ISO, intenta normalizar
  const dt = new Date(d);
  if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  return String(d);
}

/** Formatea número a N decimales (default 2). Si no es número, retorna '' */
export function asMoney(v: unknown, decimals = 2): string {
  return isNumber(v) ? v.toFixed(decimals) : '';
}

/** Normaliza claves de IVA: 19 -> vat_19 ; 0.19 -> vat_19 ; 'vat_19' se respeta */
export function normalizeVatKey(key: string | number): string {
  const s = String(key);
  if (s.startsWith('vat_')) return s;
  const n = Number(s);
  if (Number.isFinite(n)) {
    const pct = n <= 1 ? Math.round(n * 100) : Math.round(n);
    return `vat_${pct}`;
  }
  return s;
}

/** Ordena columnas de IVA por tasa descendente: vat_19, vat_5, vat_0, luego alfabético */
export function sortVatCols(keys: Array<string | number>): string[] {
  return Array.from(new Set(keys.map((k) => normalizeVatKey(k)))).sort(
    (a, b) => {
      const an = Number(a.split('_')[1]);
      const bn = Number(b.split('_')[1]);
      const aNum = Number.isFinite(an);
      const bNum = Number.isFinite(bn);
      if (aNum && bNum) return bn - an; // mayor tasa primero
      if (aNum) return -1;
      if (bNum) return 1;
      return a.localeCompare(b);
    },
  );
}

/**
 * Aplana filas de libro para CSV:
 * - Convierte vatByRate a columnas fijas (vat_19, vat_5, vat_0, …)
 * - Devuelve filas planas stringificadas y headers consistentes.
 */
export function flattenBookRows(
  rows: BookLikeRow[],
  opts?: { decimals?: number },
): {
  flat: Record<string, string>[];
  headers: string[];
  vatCols: string[];
} {
  const decimals = opts?.decimals ?? 2;

  // 1) Recolectar todas las columnas de IVA presentes (normalizadas)
  const allVatKeys: Array<string | number> = [];
  for (const r of rows ?? []) {
    if (!r?.vatByRate) continue;
    for (const k of Object.keys(r.vatByRate)) allVatKeys.push(k);
  }
  const vatCols = sortVatCols(allVatKeys);

  // 2) Construir filas planas
  const flat = (rows ?? []).map((r) => {
    const out: Record<string, string> = {
      date: formatDateISO(r.date),
      number: r.number != null ? String(r.number) : '',
      thirdPartyId: r.thirdPartyId != null ? String(r.thirdPartyId) : '',
      thirdPartyName: r.thirdPartyName != null ? String(r.thirdPartyName) : '',
      taxBase: asMoney(r.taxBase, decimals),
    };

    // IVA por tasa
    const by = r.vatByRate || {};
    for (const col of vatCols) {
      const key = normalizeVatKey(col);
      const srcKey = Object.prototype.hasOwnProperty.call(by, key)
        ? key
        : // fallback por si en origen vino "19" o "0.19"
          (Object.keys(by).find((k) => normalizeVatKey(k) === key) ?? key);
      out[key] = asMoney((by as any)[srcKey], decimals) || '0.00';
    }

    out['withholdings'] = asMoney(r.withholdings ?? 0, decimals) || '0.00';
    out['total'] = asMoney(r.total, decimals);
    return out;
  });

  const headers = [
    'date',
    'number',
    'thirdPartyId',
    'thirdPartyName',
    'taxBase',
    ...vatCols.map((k) => normalizeVatKey(k)),
    'withholdings',
    'total',
  ];

  return { flat, headers, vatCols: headers.slice(5, headers.length - 2) };
}

/** CSV simple y seguro para Excel/Google Sheets */
export function toCsv(
  rows: Array<Record<string, any>>,
  headers?: string[],
  opts?: { bom?: boolean },
): string {
  if (!rows?.length) return '';
  const cols = headers ?? Object.keys(rows[0] ?? {});
  const esc = (v: any) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    // Excel-friendly: separador coma, escapar comillas y saltos
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = cols.join(',');
  const body = rows.map((r) => cols.map((c) => esc(r[c])).join(',')).join('\n');
  const csv = head + '\n' + body;
  return opts?.bom ? '\uFEFF' + csv : csv;
}
