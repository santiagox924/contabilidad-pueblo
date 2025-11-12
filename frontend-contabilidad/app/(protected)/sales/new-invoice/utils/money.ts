// app/(protected)/sales/new-invoice/utils/money.ts

/**
 * Formatea un número como moneda (por defecto COP con locale es-CO).
 * Asegura dos decimales y separadores de miles.
 */
export function money(
  value: number | string,
  {
    locale = 'es-CO',
    currency = 'COP',
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
  }: {
    locale?: string
    currency?: string
    minimumFractionDigits?: number
    maximumFractionDigits?: number
  } = {}
): string {
  const n = typeof value === 'string' ? Number(value) : value
  const safe = Number.isFinite(n) ? n : 0
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(safe)
}

/**
 * Redondea a 2 decimales con corrección de EPSILON.
 */
export function r2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100
}

/**
 * Convierte pesos a centavos (enteros), útil antes de enviar a APIs.
 */
export function toCents(n: number | string): number {
  const v = typeof n === 'string' ? Number(n) : n
  const safe = Number.isFinite(v) ? v : 0
  return Math.round(r2(safe) * 100)
}

/**
 * Convierte centavos (enteros) a pesos con 2 decimales.
 */
export function fromCents(cents: number): number {
  const v = Number.isFinite(cents) ? cents : 0
  return r2(v / 100)
}
