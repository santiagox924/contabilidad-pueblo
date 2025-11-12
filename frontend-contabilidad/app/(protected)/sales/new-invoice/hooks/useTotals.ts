'use client'

import { useMemo } from 'react'

/** Tipos mínimos para evitar dependencias circulares */
type PaymentType = 'CASH' | 'CREDIT'
type Line = {
  qty: number
  unitPrice: number
  discountPct?: number
  vatPct?: number
  lineTotal?: number
  priceIncludesTax?: boolean
}
type PaymentRow = { method: string; amount: number; note?: string }

/** Redondeo a 2 decimales con corrección de EPSILON */
const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

/**
 * Calcula subtotal, descuento, IVA y total a partir de las líneas.
 * Si paymentType es CREDIT, aplica el incremento (creditMarkupPct) sobre el total
 * y calcula cuota inicial (downPayment) y total a financiar.
 *
 * Nota: los totales se recomputan a partir de qty * unitPrice y los % de
 * descuento/IVA. El backend validará y recalculará nuevamente.
 */
export function useTotals(
  lines: Line[],
  paymentType: PaymentType,
  creditMarkupPct: number | '',
  downPayment: number | '',
  defaultPriceIncludesTax: boolean = false
) {
  const totals = useMemo(() => {
    let subtotal = 0
    let discount = 0
    let vat = 0
    let totalLines = 0

    for (const ln of lines) {
      const qty = Math.max(0, Number(ln.qty) || 0)
      const price = Math.max(0, Number(ln.unitPrice) || 0)
      if (!Number.isFinite(qty) || !Number.isFinite(price)) continue

      const gross = r2(qty * price)
      const dPctRaw = Number(ln.discountPct)
      const dPct = Number.isFinite(dPctRaw) ? Math.min(100, Math.max(0, dPctRaw)) : 0
      const vPctRaw = Number(ln.vatPct)
      const vPct = Number.isFinite(vPctRaw) ? Math.max(0, vPctRaw) : 0
      const includesVat = (ln.priceIncludesTax ?? defaultPriceIncludesTax) === true

      const divisor = includesVat && vPct > 0 ? 1 + vPct / 100 : 1
      const baseBeforeDiscount = divisor > 0 ? r2(gross / divisor) : gross
      const lineDisc = r2(baseBeforeDiscount * (dPct / 100))
      const baseAfterDiscount = r2(baseBeforeDiscount - lineDisc)
      const lineVat = r2(baseAfterDiscount * (vPct / 100))
      const lineTotal = r2(baseAfterDiscount + lineVat)

      subtotal += baseBeforeDiscount
      discount += lineDisc
      vat += lineVat
      totalLines += lineTotal
    }

    subtotal = r2(subtotal)
    discount = r2(discount)
    vat = r2(vat)

    // Total con posible recargo por crédito
    let total = r2(totalLines)
    if (paymentType === 'CREDIT' && creditMarkupPct !== '') {
      const pct = Number(creditMarkupPct)
      if (Number.isFinite(pct) && pct > 0) total = r2(total * (1 + pct / 100))
    }

    // Cuota inicial y total a financiar
    const dp =
      paymentType === 'CREDIT' && downPayment !== ''
        ? Math.max(0, Number(downPayment) || 0)
        : 0
    const toFinance = Math.max(0, total - dp)

    return {
      subtotal: r2(subtotal),
      discount: r2(discount),
      vat: r2(vat),
      total: r2(total),
      downPayment: r2(dp),
      toFinance: r2(toFinance),
    }
  }, [lines, paymentType, creditMarkupPct, downPayment])

  return totals
}

/** Utilitario para sumar pagos capturados (para contado debe igualar el total). */
export const sumPayments = (payments: PaymentRow[]) =>
  payments.reduce((a, p) => a + (Number(p.amount) || 0), 0)

export default useTotals
