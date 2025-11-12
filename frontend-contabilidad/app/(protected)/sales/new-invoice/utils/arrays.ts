// app/(protected)/sales/new-invoice/utils/arrays.ts

/**
 * Normaliza diferentes formatos de respuesta (REST, paginadas, etc.)
 * a un array plano de objetos.
 */
export function normalizeArray(res: any): any[] {
  const x = res && typeof res === 'object' && 'data' in res ? (res as any).data : res
  if (Array.isArray(x)) return x
  if (!x || typeof x !== 'object') return []
  if (Array.isArray((x as any).items)) return (x as any).items
  if (Array.isArray((x as any).data)) return (x as any).data
  if (Array.isArray((x as any).results)) return (x as any).results
  return []
}

/**
 * Elimina duplicados en un array de primitivos (string, number).
 */
export function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr))
}

/**
 * Divide un array en chunks de tamaño fijo.
 */
export function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr]
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size))
  }
  return result
}

/**
 * Ordena una lista de objetos por un campo string/number.
 */
export function sortBy<T>(arr: T[], key: keyof T, dir: 'asc' | 'desc' = 'asc'): T[] {
  return [...arr].sort((a, b) => {
    const av = a[key]
    const bv = b[key]
    if (av === bv) return 0
    if (av == null) return 1
    if (bv == null) return -1
    return dir === 'asc'
      ? (av > bv ? 1 : -1)
      : (av < bv ? 1 : -1)
  })
}
