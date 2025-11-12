// api/src/common/rounding.ts

/**
 * Redondea un número a una cantidad de decimales con el modo indicado.
 * @param n número de entrada
 * @param decimals número de decimales (default: 2)
 * @param mode estrategia: 'HALF_UP' (default), 'TRUNC', 'CEIL', 'FLOOR'
 */
export function round(
  n: number,
  decimals = 2,
  mode: 'HALF_UP' | 'TRUNC' | 'CEIL' | 'FLOOR' = 'HALF_UP',
): number {
  if (!Number.isFinite(n)) return 0;
  const factor = Math.pow(10, decimals);

  switch (mode) {
    case 'TRUNC':
      return Math.trunc(n * factor) / factor;
    case 'CEIL':
      return Math.ceil(n * factor) / factor;
    case 'FLOOR':
      return Math.floor(n * factor) / factor;
    case 'HALF_UP':
    default:
      return Math.round((n + Number.EPSILON) * factor) / factor;
  }
}

/**
 * Redondeo estándar a 2 decimales (modo HALF_UP).
 */
export function round2(n: number): number {
  return round(n, 2, 'HALF_UP');
}
