// api/src/accounting/exogena/templates/utils.ts
// Utilitarios de apoyo para formateos, agrupaciones y CSV opcional (sin encabezados)

export function onlyDigits(s?: string | number | null): string {
  if (s == null) return '';
  return String(s).replace(/\D+/g, '');
}

export function leftPad(value: string | number, length: number, pad = '0') {
  const s = String(value ?? '');
  return s.length >= length ? s : pad.repeat(length - s.length) + s;
}

export function safeUpper(s?: string | null) {
  return (s ?? '').toString().toUpperCase();
}

export function toNumber(x: unknown): number {
  if (x == null) return 0;
  const n = Number(x as any);
  return Number.isFinite(n) ? n : 0;
}

export function toFixedN(x: unknown, decimals = 2): string {
  const n = toNumber(x);
  return n.toFixed(decimals);
}

export function groupBy<T, K extends string | number>(
  rows: T[],
  key: (r: T) => K,
) {
  const map = new Map<K, T[]>();
  for (const r of rows || []) {
    const k = key(r);
    const arr = map.get(k) ?? [];
    arr.push(r);
    map.set(k, arr);
  }
  return map;
}

/** Suma segura sobre propiedad numérica */
export function sumBy<T>(rows: T[], get: (r: T) => number): number {
  let acc = 0;
  for (const r of rows || []) acc += get(r);
  return acc;
}

/** Extrae NIT & DV preferentemente del tercero enriquecido, sino de la factura */
export function resolveTaxId(
  tp?: { taxId?: string | null; dv?: string | number | null } | null,
): { nit: string; dv: string } {
  const nit = onlyDigits(tp?.taxId ?? '');
  const dv = onlyDigits(tp?.dv ?? '');
  return { nit, dv };
}

/** Construye CSV (sin encabezados), separador ';' por defecto */
export function exogenaToCsv<T>(
  rows: T[],
  fields: { name: string; resolve: (r: T) => unknown }[],
  sep = ';',
) {
  const esc = (v: unknown) => {
    if (v == null) return '';
    const s = String(v);
    return /[;\n"]/g.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const out: string[] = [];
  for (const r of rows) {
    out.push(fields.map((f) => esc(f.resolve(r))).join(sep));
  }
  return out.join('\n');
}
