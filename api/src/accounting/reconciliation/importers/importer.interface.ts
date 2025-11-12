// api/src/accounting/reconciliation/importers/importer.interface.ts
export type RawRow = Record<string, string | number | null | undefined>;

export interface ParsedLine {
  date: Date;
  description?: string;
  reference?: string;
  amount: number; // positivo = crédito, negativo = débito (o viceversa según banco)
  balance?: number;
  externalId?: string;
}

export interface BankImporter {
  /** Nombre “humano” del banco (p.ej. "Bancolombia", "Davivienda", "BBVA", "Generic") */
  bank: string;

  /**
   * Devuelve true si este importador puede manejar el archivo en base al nombre
   * y una muestra de filas ya leídas (encabezados y 5–10 filas).
   */
  canHandle: (fileName: string, sample: RawRow[]) => boolean;

  /**
   * Convierte filas crudas normalizadas (por header→valor) a ParsedLine[]
   * Lanzar error si la estructura no cuadra.
   */
  parse: (rows: RawRow[]) => ParsedLine[];
}

/**
 * Utilidad: normaliza encabezados a snake_case minúscula sin tildes ni símbolos
 * (se usa en el servicio también).
 */
export const normalizeHeader = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

/**
 * Utilidad: intenta convertir cadenas a número (montos) respetando separadores comunes.
 */
export const toNumber = (v: unknown): number | undefined => {
  if (v == null) return undefined;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  const s = String(v).trim();
  if (!s) return undefined;
  // quitar separador de miles . o , cuando venga acompañado del otro como decimal
  // casos: "1.234,56" → 1234.56 | "1,234.56" → 1234.56 | "1234,56" → 1234.56 | "1234.56" → 1234.56
  const comma = s.includes(',');
  const dot = s.includes('.');
  let cleaned = s.replace(/[^0-9,.\-]/g, '');
  if (comma && dot) {
    // El último símbolo asúmelo como decimal
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    const decIsComma = lastComma > lastDot;
    cleaned = cleaned.replace(decIsComma ? /\./g : /,/g, '');
    if (decIsComma) cleaned = cleaned.replace(',', '.');
  } else if (comma && !dot) {
    cleaned = cleaned.replace(',', '.');
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Utilidad: intenta parsear fechas comunes (DD/MM/YYYY, YYYY-MM-DD, etc.)
 */
export const toDate = (v: unknown): Date | undefined => {
  if (v == null) return undefined;
  if (v instanceof Date && !isNaN(v.valueOf())) return v;
  const s = String(v).trim();
  if (!s) return undefined;
  // YYYY-MM-DD o YYYY/MM/DD
  if (/^\d{4}[-/]\d{2}[-/]\d{2}$/.test(s))
    return new Date(s.replace(/\//g, '-'));
  // DD/MM/YYYY o DD-MM-YYYY
  const m = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}`);
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t) : undefined;
};
