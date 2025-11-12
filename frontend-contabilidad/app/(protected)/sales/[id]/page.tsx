'use client'
// app/(protected)/sales/[id]/page.tsx
import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import { api } from '@/lib/api'
import { money, toNum } from '@/lib/format'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'

type InvoiceLine = {
  id: number
  itemId: number
  qty: number | string
  unitPrice?: number | string | null
  discountPct?: number | string | null
  vatPct?: number | string | null
  lineSubtotal?: number | string | null
  lineVat?: number | string | null
  lineTotal?: number | string | null
  uom?: string | null
  item?: {
    id: number
    name?: string | null
    sku?: string | null
    type?: 'PRODUCT' | 'SERVICE' | null
  } | null
}

type Installment = {
  id: number
  number?: number | null
  dueDate?: string | null
  amount?: number | string | null
  paidAmount?: number | string | null
  status?: 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELED' | string | null
  paidAt?: string | null
  note?: string | null
}

type AR = {
  id: number
  thirdPartyId: number
  invoiceId: number
  balance: number | string
  installments?: Installment[]
}

type Party = {
  id: number
  name: string
  document?: string | null
  email?: string | null
  personKind?: 'NATURAL' | 'JURIDICAL' | null
  responsibilities?: string[] | null
}

/** Recibo tal como llega desde tesorería (endpoint /treasury/receipts) */
type Receipt = {
  id: number
  date?: string | null
  amount: number | string
  method?: string | null
  paymentMethod?: string | null
  type?: string | null
  medio?: string | null
  note?: string | null
  thirdPartyId?: number | null
  thirdParty?: { id: number; name?: string | null } | null
  invoiceId?: number | null
}

/** Recibo embebido en la factura vía receiptAllocations.receipt */
type ReceiptFromAllocation = {
  id: number
  date?: string | null
  method?: string | null
  paymentMethod?: string | null
  type?: string | null
  medio?: string | null
  note?: string | null
  thirdPartyId?: number | null
  thirdParty?: { id: number; name?: string | null } | null
}

type ReceiptAllocation = {
  id: number
  amount: number | string
  receipt?: ReceiptFromAllocation | null
}

type Sale = {
  id: number
  number: number
  thirdPartyId: number
  thirdParty?: Party
  issueDate: string
  dueDate?: string | null
  paymentType: 'CASH' | 'CREDIT'
  status: string
  subtotal: number | string
  tax: number | string
  total: number | string
  creditMarkupPct?: number | null
  downPaymentAmount?: number | string | null
  note?: string | null
  lines: InvoiceLine[]
  ar?: AR
  /** 👇 nuevo: pagos enlazados directamente a la factura */
  receiptAllocations?: ReceiptAllocation[]
}

function fmtDate(s?: string | null){
  if (!s) return '—'
  try {
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return s as string
    return d.toISOString().slice(0,10)
  } catch { return s as string }
}

function isVoidedStatus(s?: string | null) {
  if (!s) return false
  const n = s.toLowerCase()
  return n.includes('void') || n.includes('anul') || n.includes('cancel')
}

function monthLabel(dStr?: string | null) {
  if (!dStr) return ''
  try {
    const d = new Date(dStr)
    return d.toLocaleString('es-CO', { month: 'long', year: 'numeric' })
  } catch { return '' }
}

function statusEs(s?: string | null) {
  const t = (s ?? '').toUpperCase()
  switch (t) {
    case 'ISSUED': return 'Emitida'
    case 'VOID':
    case 'VOIDED':
    case 'CANCELED':
    case 'CANCELLED': return 'Anulada'
    case 'PAID': return 'Pagada'
    case 'PARTIALLY_PAID': return 'Parcial'
    case 'PENDING': return 'Pendiente'
    default: return s ?? '—'
  }
}

// Mini pill (usada en cuotas si se muestra)
function Pill({
  color,
  children,
}: {
  color: 'green' | 'red' | 'amber' | 'yellow'
  children: React.ReactNode
}) {
  const map: Record<string, string> = {
    green: 'border-green-600 text-green-700 bg-green-100/70',
    red: 'border-red-600 text-red-700 bg-red-100/70',
    amber: 'border-amber-500 text-amber-700 bg-amber-100/70',
    yellow: 'border-yellow-500 text-yellow-700 bg-yellow-100/70',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${map[color]}`}>
      {children}
    </span>
  )
}

export default function SaleDetail({ params }: { params: { id: string } }){
  const id = params.id
  const qc = useQueryClient()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  // === Factura (ya incluye receiptAllocations.receipt con method/note) ===
  const sale = useQuery<Sale>({
    queryKey: ['sale', id],
    queryFn: async () => (await api.get(`/sales/${id}`)).data,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  })

  // === Respaldo: recibos de tesorería por invoiceId (si por alguna razón no vienen allocations) ===
  const receipts = useQuery<Receipt[]>({
    queryKey: ['sale', id, 'receipts'],
    queryFn: async () => {
      try {
        const res = await api.get(`/treasury/receipts?invoiceId=${id}`)
        const raw = (res as any).data ?? res
        if (Array.isArray(raw)) return raw as Receipt[]
        if (Array.isArray(raw?.items)) return raw.items as Receipt[]
        if (Array.isArray(raw?.data)) return raw.data as Receipt[]
        return []
      } catch {
        return []
      }
    },
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  })

  // Normalizador de método (sirve tanto para Receipt como para ReceiptFromAllocation)
  // 🔧 Arreglado: si viene un objeto, prioriza accountName y luego name/label
  const getMethodAny = (obj?: any) => {
    const m = obj?.method ?? obj?.paymentMethod ?? obj?.type ?? obj?.medio ?? null
    if (!m) return ''
    if (typeof m === 'string') return m.trim()
    if (typeof m === 'object') {
      const n = (m.accountName ?? m.name ?? m.label ?? '').toString().trim()
      return n || '[sin nombre]'
    }
    return String(m).trim()
  }

  // === Pagos desde allocations (preferido) ===
  const allocPayments = useMemo(() => {
    const allocs = sale.data?.receiptAllocations ?? []
    return allocs.map(a => ({
      id: a.id,
      method: getMethodAny(a.receipt) || '—',
      amount: toNum(a.amount) ?? 0,
      note: (a.receipt?.note ?? '').toString().trim(),
    })).filter(p => p.method !== '—' || p.amount > 0 || !!p.note)
  }, [sale.data?.receiptAllocations])

  // === Pagos desde tesorería (respaldo) ===
  const treasuryPayments = useMemo(() => {
    return (receipts.data ?? []).map(r => ({
      id: r.id,
      method: getMethodAny(r) || '—',
      amount: toNum(r.amount) ?? 0,
      note: (r.note ?? '').toString().trim(),
      date: r.date,
      thirdParty: r.thirdParty,
    })).filter(p => p.method !== '—' || p.amount > 0 || !!p.note)
  }, [receipts.data])

  // === Conjunto a mostrar en el encabezado: allocations si existen; si no, tesorería
  const headerPayments = allocPayments.length > 0 ? allocPayments : treasuryPayments

  const receiptsTotal = useMemo(
    () => (treasuryPayments ?? []).reduce((a, r) => a + (r.amount ?? 0), 0),
    [treasuryPayments]
  )

  const hasPayments = useMemo(() => {
    const inst = sale.data?.ar?.installments ?? []
    return inst.some(c => {
      const amount = toNum(c.amount) ?? 0
      const paid = toNum(c.paidAmount) ?? 0
      return paid > 0 || c.status === 'PAID'
    })
  }, [sale.data])

  const alreadyVoided = isVoidedStatus(sale.data?.status)

  const voidMut = useMutation({
    mutationFn: async () => {
      setErrorMsg(null)
      setOkMsg(null)
      try {
        const res = await api.post(`/sales/${id}/void`)
        return (res as any).data ?? res
      } catch (e1:any) {
        try {
          const res = await api.post(`/sales/${id}/cancel`)
          return (res as any).data ?? res
        } catch (e2:any) {
          const msg = e1?.response?.data?.message ?? e2?.response?.data?.message ?? e2?.message ?? e1?.message ?? 'No se pudo anular la factura'
          throw new Error(msg)
        }
      }
    },
    onSuccess: () => {
      setOkMsg('Factura anulada correctamente.')
      qc.invalidateQueries({ queryKey: ['sale', id] })
      qc.invalidateQueries({ queryKey: ['sale', id, 'receipts'] })
      qc.invalidateQueries({ predicate: q => Array.isArray(q.queryKey) && String(q.queryKey[0]).startsWith('sales') })
    },
    onError: (err:any) => setErrorMsg(err?.message ?? 'Error al anular')
  })

  const kpis = useMemo(() => {
    const s = sale.data
    const subtotal = toNum(s?.subtotal) ?? 0
    const tax = toNum(s?.tax) ?? 0
    const total = toNum(s?.total) ?? 0
    const balance = toNum(s?.ar?.balance) ?? 0
    const creditMarkupPct =
      typeof (s as any)?.creditMarkupPct === 'number'
        ? Number((s as any).creditMarkupPct)
        : (s?.creditMarkupPct ?? 0)
    const downPayment = toNum((s as any)?.downPaymentAmount) ?? 0
    const financed = Math.max(0, total - downPayment)
    return { subtotal, tax, total, balance, creditMarkupPct, downPayment, financed }
  }, [sale.data])

  const showPrevMonthBanner = useMemo(() => {
    const s = sale.data?.issueDate
    if (!s) return false
    const d = new Date(s)
    const now = new Date()
    const firstThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    return d < firstThisMonth
  }, [sale.data?.issueDate])

  return (
    <Protected>
      <Navbar />
      <main className="container py-8 space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold">Factura #{sale.data?.number ?? id}</h1>
          <div className="flex gap-2">
            <button
              className="btn btn-outline btn-error"
              onClick={() => {
                if (!sale.data) return
                if (alreadyVoided) return
                const msg = hasPayments
                  ? 'Esta factura tiene pagos registrados en sus cuotas. Anularla revertirá saldos y puede fallar si hay restricciones. ¿Deseas continuar?'
                  : '¿Seguro que deseas anular esta factura? Se revertirá el stock y las cuentas por cobrar.'
                if (window.confirm(msg)) voidMut.mutate()
              }}
              disabled={!sale.data || alreadyVoided || voidMut.isPending}
              title={alreadyVoided ? 'La factura ya está anulada' : hasPayments ? 'Tiene pagos' : 'Anular factura'}
            >
              {voidMut.isPending ? 'Anulando…' : (alreadyVoided ? 'Anulada' : 'Anular')}
            </button>

            <a className="btn" href="/sales">Volver</a>
            <a className="btn btn-primary" href="/sales/new-invoice">Nueva factura</a>
          </div>
        </div>

        {okMsg && <div className="rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 p-3 text-sm">{okMsg}</div>}
        {errorMsg && <div className="rounded-lg border border-red-300 bg-red-50 text-red-800 p-3 text-sm">{errorMsg}</div>}

        {alreadyVoided && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            Esta factura se encuentra <strong>ANULADA</strong>.
          </div>
        )}

        {showPrevMonthBanner && !alreadyVoided && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            Esta factura fue emitida en <strong>{monthLabel(sale.data?.issueDate)}</strong>, mes que pudo tener cierre contable.
          </div>
        )}

        {sale.data?.paymentType === 'CREDIT' && !!kpis.creditMarkupPct ? (
          <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-3 text-sm text-indigo-700">
            Incremento por crédito aplicado: <strong>{kpis.creditMarkupPct}%</strong>
          </div>
        ) : null}

        {sale.data?.paymentType === 'CREDIT' && kpis.downPayment > 0 ? (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-700">
            Cuota inicial: <strong>{money(kpis.downPayment)}</strong>
          </div>
        ) : null}

        {/* Cabecera con métodos (Método — Monto — Nota) */}
        <div className="card grid md:grid-cols-5 gap-4">
          <div>
            <div className="text-sm text-gray-600">Estado</div>
            <div className="mt-1">{statusEs(sale.data?.status)}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Fecha</div>
            <div className="mt-1">{fmtDate(sale.data?.issueDate)}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Vence</div>
            <div className="mt-1">{fmtDate(sale.data?.dueDate)}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Pago</div>
            <div className="mt-1">
              {sale.data?.paymentType === 'CASH' ? 'Contado' : 'Crédito'}
            </div>
          </div>

          {/* Métodos de pago (de allocations o, si no hay, de tesorería) */}
          <div>
            <div className="text-sm text-gray-600">Métodos</div>
            <div className="mt-1">
              {headerPayments.length > 0 ? (
                <ol className="list-decimal pl-5 space-y-0.5">
                  {headerPayments.map((p, i) => (
                    <li key={p.id ?? i} className="text-sm">
                      <span className="font-medium">{p.method || '—'}</span>
                      <span> — {money(p.amount)}</span>
                      {p.note ? <span className="opacity-70"> — {p.note}</span> : null}
                    </li>
                  ))}
                </ol>
              ) : (
                <span className="text-sm">—</span>
              )}
            </div>
          </div>

          <div className="md:col-span-5">
            <div className="text-sm text-gray-600">Cliente</div>
            <div className="mt-1">
              {sale.data?.thirdParty?.name ?? `#${sale.data?.thirdPartyId}`}
              {sale.data?.thirdParty?.document ? ` · ${sale.data.thirdParty.document}` : ''}
              {sale.data?.thirdParty?.personKind === 'JURIDICAL' &&
                Array.isArray(sale.data?.thirdParty?.responsibilities) &&
                (sale.data!.thirdParty!.responsibilities as string[]).length > 0 && (
                  <div className="text-xs text-gray-600 mt-1">
                    Responsabilidades:&nbsp;
                    <span className="font-medium">
                      {(sale.data!.thirdParty!.responsibilities as string[]).join(', ')}
                    </span>
                  </div>
              )}
            </div>
          </div>

          {sale.data?.note && (
            <div className="md:col-span-5">
              <div className="text-sm text-gray-600">Nota</div>
              <div className="mt-1 whitespace-pre-wrap">{sale.data.note}</div>
            </div>
          )}
        </div>

        {/* Líneas */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-3">Líneas</h2>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th className="th">Item</th>
                  <th className="th">Cant.</th>
                  <th className="th">Unidad</th>
                  <th className="th">Precio</th>
                  <th className="th">Desc %</th>
                  <th className="th">IVA %</th>
                  <th className="th">Subtotal</th>
                  <th className="th">IVA</th>
                  <th className="th">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(sale.data?.lines ?? []).map((l) => {
                  const qty = toNum(l.qty) ?? 0
                  const unit = toNum(l.unitPrice) ?? 0
                  const disc = toNum(l.discountPct)
                  const vatp = toNum(l.vatPct)

                  const lineSubtotal = toNum(l.lineSubtotal) ?? qty * unit * (1 - (typeof disc === 'number' ? disc : 0)/100)
                  const lineVat = toNum(l.lineVat) ?? (vatp ? lineSubtotal * (vatp/100) : 0)
                  const lineTotal = toNum(l.lineTotal) ?? (lineSubtotal + lineVat)

                  return (
                    <tr key={l.id}>
                      <td className="td">
                        {l.item?.name ? `${l.item.name}${l.item.sku ? ` (${l.item.sku})` : ''}` : `#${l.itemId}`}
                        {l.item?.type === 'SERVICE' && <span className="ml-2 text-xs text-gray-500">Servicio</span>}
                      </td>
                      <td className="td">{qty}</td>
                      <td className="td">{l.uom ?? '—'}</td>
                      <td className="td">{money(unit)}</td>
                      <td className="td">{typeof disc === 'number' ? `${disc}%` : '—'}</td>
                      <td className="td">{typeof vatp === 'number' ? `${vatp}%` : '—'}</td>
                      <td className="td">{money(lineSubtotal)}</td>
                      <td className="td">{money(lineVat)}</td>
                      <td className="td">{money(lineTotal)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* KPIs / Totales */}
        <section className="flex flex-wrap gap-4 justify-end">
          <div className="card">
            <div className="text-sm text-gray-600">Subtotal</div>
            <div className="text-xl font-semibold">{money(kpis.subtotal)}</div>
          </div>
          <div className="card">
            <div className="text-sm text-gray-600">IVA</div>
            <div className="text-xl font-semibold">{money(kpis.tax)}</div>
          </div>
          <div className="card">
            <div className="text-sm text-gray-600">Total</div>
            <div className="text-xl font-semibold">{money(kpis.total)}</div>
          </div>

          {sale.data?.paymentType === 'CREDIT' ? (
            <>
              <div className="card">
                <div className="text-sm text-gray-600">Cuota inicial</div>
                <div className="text-xl font-semibold">
                  {kpis.downPayment > 0 ? money(kpis.downPayment) : '—'}
                </div>
              </div>
              <div className="card">
                <div className="text-sm text-gray-600">Total financiado</div>
                <div className="text-xl font-semibold">{money(kpis.financed)}</div>
              </div>
            </>
          ) : null}

          {sale.data?.paymentType === 'CREDIT' && (
            <div className="card">
              <div className="text-sm text-gray-600">Saldo CxC</div>
              <div className="text-xl font-semibold">{money(kpis.balance)}</div>
            </div>
          )}
        </section>

        {/* Pagos registrados (si el endpoint de tesorería está disponible) */}
        {(treasuryPayments.length ?? 0) > 0 && (
          <div className="card">
            <h2 className="text-lg font-semibold mb-3">Pagos registrados</h2>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th className="th">Fecha</th>
                    <th className="th">Pagador</th>
                    <th className="th">Método</th>
                    <th className="th">Monto</th>
                    <th className="th">Nota</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {treasuryPayments.map(r => (
                    <tr key={r.id}>
                      <td className="td">{fmtDate((receipts.data ?? []).find(x => x.id === r.id)?.date)}</td>
                      <td className="td">{(receipts.data ?? []).find(x => x.id === r.id)?.thirdParty?.name ?? '—'}</td>
                      <td className="td">{r.method || '—'}</td>
                      <td className="td">{money(toNum(r.amount) ?? 0)}</td>
                      <td className="td">{r.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-right mt-3 text-sm">
              Total pagos: <strong>{money(receiptsTotal)}</strong>
            </div>
          </div>
        )}
      </main>
    </Protected>
  )
}
