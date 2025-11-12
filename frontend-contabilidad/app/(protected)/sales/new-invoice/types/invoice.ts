// app/(protected)/sales/new-invoice/utils/invoice.ts

import { money } from '@/lib/format'

const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

export type Line = {
  qty: number
  unitPrice: number
  discountPct?: number
  vatPct?: number
  lineTotal?: number
  uomError?: string
  priceIncludesTax?: boolean
}

export type Totals = {
  subtotal: number
  discount: number
  vat: number
  total: number
  downPayment: number
  toFinance: number
}

export type PaymentRow = { method: string; amount: number; note?: string }

/**
 * Calcula totales a partir de líneas y reglas de crédito.
 */
export function computeTotals(
  lines: Line[],
  paymentType: 'CASH' | 'CREDIT',
  creditMarkupPct: number | '',
  downPayment: number | '',
  defaultPriceIncludesTax: boolean = false
): Totals {
  let subtotal = 0
  let discount = 0
  let vat = 0

  for (const ln of lines) {
    const qty = Number(ln.qty || 0)
    const price = Number(ln.unitPrice || 0)
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

    subtotal += baseBeforeDiscount
    discount += lineDisc
    vat += lineVat
  }

  subtotal = r2(subtotal)
  discount = r2(discount)
  vat = r2(vat)

  let total = r2(subtotal - discount + vat)
  if (paymentType === 'CREDIT' && creditMarkupPct !== '') {
    const pct = Number(creditMarkupPct)
    if (!Number.isNaN(pct) && pct > 0) total = r2(total * (1 + pct / 100))
  }

  const dp =
    paymentType === 'CREDIT' && downPayment !== ''
      ? Math.max(0, Number(downPayment) || 0)
      : 0
  const toFinance = Math.max(0, total - dp)

  return {
    subtotal,
    discount,
    vat,
    total: r2(total),
    downPayment: r2(dp),
    toFinance: r2(toFinance),
  }
}

/**
 * Suma todos los pagos.
 */
export function sumPayments(payments: PaymentRow[]): number {
  return payments.reduce((a, p) => a + (Number(p.amount) || 0), 0)
}

/**
 * Compara dos montos con tolerancia a centavos.
 */
export function eqCents(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100)
}

/**
 * Valida reglas básicas de pagos según tipo de factura.
 * Devuelve `null` si todo bien, o un string con error.
 */
export function validatePayments(
  paymentType: 'CASH' | 'CREDIT',
  payments: PaymentRow[],
  totals: Totals,
  installments?: number,
  firstDueDate?: string
): string | null {
  if (paymentType === 'CASH') {
    if (payments.length === 0) return 'En contado debes registrar al menos un pago.'
    if (!eqCents(sumPayments(payments), totals.total)) {
      return `La suma de pagos (${money(sumPayments(payments))}) debe ser igual al total (${money(totals.total)}).`
    }
  } else {
    if (!installments || installments < 1) return 'Indica cuántas cuotas tendrá después de la inicial.'
    if (!firstDueDate) return 'Indica desde cuándo empiezan las cuotas posteriores.'
    if (totals.downPayment > totals.total) return 'La cuota inicial no puede exceder el total de la factura.'
    if (totals.downPayment > 0) {
      if (payments.length === 0) return 'Debes registrar el pago de la cuota inicial.'
      if (!eqCents(sumPayments(payments), totals.downPayment)) {
        return 'El pago debe ser exactamente igual al valor de la cuota inicial.'
      }
    }
  }
  return null
}
