// lib/format.ts
export const toNum = (n: unknown): number | undefined => {
  if (typeof n === 'number') return Number.isNaN(n) ? undefined : n
  if (typeof n === 'string') {
    const v = Number(n)
    return Number.isNaN(v) ? undefined : v
  }
  // Prisma Decimal u otros tipos con toString()
  if (n && typeof (n as any).toString === 'function') {
    const v = Number((n as any).toString())
    return Number.isNaN(v) ? undefined : v
  }
  return undefined
}

export const money = (n: unknown, opts?: Intl.NumberFormatOptions & { currency?: string }) => {
  const v = toNum(n)
  if (typeof v !== 'number') return '—'
  const currency = opts?.currency ?? 'COP'
  const format: Intl.NumberFormatOptions = {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
    ...opts,
  }
  return v.toLocaleString('es-CO', format)
}
