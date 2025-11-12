'use client'

import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import { api } from '@/lib/api'
import { money, toNum } from '@/lib/format'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'

type PurchaseLine = {
  id: number
  itemId: number
  qty: number | string
  unitCost?: number | string | null
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

type AP = {
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

type Purchase = {
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
  note?: string | null
  lines: PurchaseLine[]
  ap?: AP
}

function fmtDate(s?: string | null){
  if (!s) return '—'
  try {
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return s as string
    return d.toISOString().slice(0,10)
  } catch { return s as string }
}

function monthLabel(dStr?: string | null) {
  if (!dStr) return ''
  try {
    const d = new Date(dStr)
    return d.toLocaleString('es-CO', { month: 'long', year: 'numeric' })
  } catch { return '' }
}

function isVoidedStatus(s?: string | null) {
  if (!s) return false
  const n = s.toLowerCase()
  return n.includes('void') || n.includes('anul') || n.includes('cancel')
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
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${map[color]}`}
    >
      {children}
    </span>
  )
}

export default function PurchaseDetail({ params }: { params: { id: string } }){
  const id = params.id
  const qc = useQueryClient()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  const purchase = useQuery<Purchase>({
    queryKey: ['purchase', id],
    queryFn: async () => (await api.get(`/purchases/${id}`)).data,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  })

  const hasPayments = useMemo(() => {
    const inst = purchase.data?.ap?.installments ?? []
    return inst.some(c => {
      const amount = toNum(c.amount) ?? 0
      const paid = toNum(c.paidAmount) ?? 0
      return paid > 0 || c.status === 'PAID'
    })
  }, [purchase.data])

  const alreadyVoided = isVoidedStatus(purchase.data?.status)

  const voidMut = useMutation({
    mutationFn: async () => {
      setErrorMsg(null)
      setOkMsg(null)
      try {
        const res = await api.post(`/purchases/${id}/void`)
        return (res as any).data ?? res
      } catch (e1:any) {
        try {
          const res = await api.post(`/purchases/${id}/cancel`)
          return (res as any).data ?? res
        } catch (e2:any) {
          const msg = e1?.response?.data?.message ?? e2?.response?.data?.message ?? e2?.message ?? e1?.message ?? 'No se pudo anular la compra'
          throw new Error(msg)
        }
      }
    },
    onSuccess: () => {
      setOkMsg('Compra anulada correctamente.')
      qc.invalidateQueries({ queryKey: ['purchase', id] })
      qc.invalidateQueries({ predicate: q => Array.isArray(q.queryKey) && String(q.queryKey[0]).startsWith('purchases') })
    },
    onError: (err:any) => setErrorMsg(err?.message ?? 'Error al anular')
  })

  const kpis = useMemo(() => {
    const s = purchase.data
    const subtotal = toNum(s?.subtotal) ?? 0
    const tax = toNum(s?.tax) ?? 0
    const total = toNum(s?.total) ?? 0
    const balance = toNum(s?.ap?.balance) ?? 0
    return { subtotal, tax, total, balance }
  }, [purchase.data])

  const showPrevMonthBanner = useMemo(() => {
    const s = purchase.data?.issueDate
    if (!s) return false
    const d = new Date(s)
    const now = new Date()
    const firstThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    return d < firstThisMonth
  }, [purchase.data?.issueDate])

  return (
    <Protected>
      <Navbar />
      <main className="container py-8 space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold">Compra #{purchase.data?.number ?? id}</h1>
          <div className="flex gap-2">
            <button
              className="btn btn-outline btn-error"
              onClick={() => {
                if (!purchase.data) return
                if (alreadyVoided) return
                const msg = hasPayments
                  ? 'Esta compra tiene pagos registrados en sus cuotas. Anularla revertirá saldos y puede fallar si hay restricciones. ¿Deseas continuar?'
                  : '¿Seguro que deseas anular esta compra? Se revertirá el stock y las cuentas por pagar.'
                if (window.confirm(msg)) voidMut.mutate()
              }}
              disabled={!purchase.data || alreadyVoided || voidMut.isPending}
              title={alreadyVoided ? 'La compra ya está anulada' : hasPayments ? 'Tiene pagos' : 'Anular compra'}
            >
              {voidMut.isPending ? 'Anulando…' : (alreadyVoided ? 'Anulada' : 'Anular')}
            </button>

            <a className="btn" href="/purchases">Volver</a>
            <a className="btn btn-primary" href="/purchases/new-bill">Nueva compra</a>
          </div>
        </div>

        {/* Mensajes */}
        {okMsg && <div className="rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 p-3 text-sm">{okMsg}</div>}
        {errorMsg && <div className="rounded-lg border border-red-300 bg-red-50 text-red-800 p-3 text-sm">{errorMsg}</div>}

        {/* Avisos */}
        {alreadyVoided && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            Esta compra se encuentra <strong>ANULADA</strong>.
          </div>
        )}
        {showPrevMonthBanner && !alreadyVoided && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            Esta compra fue emitida en <strong>{monthLabel(purchase.data?.issueDate)}</strong>, mes que pudo tener cierre contable.
          </div>
        )}

        {/* Cabecera */}
        <div className="card grid md:grid-cols-5 gap-4">
          <div>
            <div className="text-sm text-gray-600">Estado</div>
            <div className="mt-1">{statusEs(purchase.data?.status)}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Fecha</div>
            <div className="mt-1">{fmtDate(purchase.data?.issueDate)}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Vence</div>
            <div className="mt-1">{fmtDate(purchase.data?.dueDate)}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Pago</div>
            <div className="mt-1">{purchase.data?.paymentType === 'CASH' ? 'Contado' : 'Crédito'}</div>
          </div>
          <div className="md:col-span-5">
            <div className="text-sm text-gray-600">Proveedor</div>
            <div className="mt-1">
              {purchase.data?.thirdParty?.name ?? `#${purchase.data?.thirdPartyId}`}
              {purchase.data?.thirdParty?.document ? ` · ${purchase.data.thirdParty.document}` : ''}
              {purchase.data?.thirdParty?.personKind === 'JURIDICAL' &&
                Array.isArray(purchase.data?.thirdParty?.responsibilities) &&
                (purchase.data!.thirdParty!.responsibilities as string[]).length > 0 && (
                  <div className="text-xs text-gray-600 mt-1">
                    Responsabilidades:&nbsp;
                    <span className="font-medium">
                      {(purchase.data!.thirdParty!.responsibilities as string[]).join(', ')}
                    </span>
                  </div>
              )}
            </div>
          </div>
          {purchase.data?.note && (
            <div className="md:col-span-5">
              <div className="text-sm text-gray-600">Nota</div>
              <div className="mt-1 whitespace-pre-wrap">{purchase.data.note}</div>
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
                  <th className="th">Costo</th>
                  <th className="th">IVA %</th>
                  <th className="th">Subtotal</th>
                  <th className="th">IVA</th>
                  <th className="th">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(purchase.data?.lines ?? []).map((l) => {
                  const qty = toNum(l.qty) ?? 0
                  const unit = toNum(l.unitCost) ?? 0
                  const vatp = toNum(l.vatPct)

                  const lineSubtotal = toNum(l.lineSubtotal) ?? qty * unit
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

        {/* Totales */}
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
          <div className="card">
            <div className="text-sm text-gray-600">Saldo CxP</div>
            <div className="text-xl font-semibold">{money(kpis.balance)}</div>
          </div>
        </section>

        {/* Plan de cuotas (si crédito) */}
        {purchase.data?.paymentType === 'CREDIT' && purchase.data?.ap?.installments?.length ? (
          <div className="card">
            <h2 className="text-lg font-semibold mb-3">Cuotas</h2>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th className="th">Cuota</th>
                    <th className="th">Vence</th>
                    <th className="th">Valor</th>
                    <th className="th">Estado</th>
                    <th className="th">Fecha pago</th>
                    <th className="th">Nota</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[...(purchase.data.ap.installments ?? [])]
                    .sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
                    .map((c, i) => {
                      const amount = toNum(c.amount) ?? 0
                      const paidAmount = toNum(c.paidAmount) ?? 0
                      const isPaid = (c.status === 'PAID') || (paidAmount >= amount && amount > 0)

                      const due = c.dueDate ? new Date(c.dueDate) : null
                      const today = new Date()
                      const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())
                      const dueDateOnly = due ? new Date(due.getFullYear(), due.getMonth(), due.getDate()) : null
                      const isOverdue = !isPaid && !!dueDateOnly && (dueDateOnly < todayDate)

                      let badge: JSX.Element
                      if (isPaid) {
                        badge = <Pill color="green">Pagada</Pill>
                      } else if (isOverdue) {
                        badge = <Pill color="red">Vencida</Pill>
                      } else if (c.status === 'PARTIALLY_PAID') {
                        badge = <Pill color="amber">Parcial</Pill>
                      } else {
                        badge = <Pill color="yellow">Pendiente</Pill>
                      }

                      return (
                        <tr key={c.id}>
                          <td className="td">Cuota {c.number ?? (i + 1)}</td>
                          <td className="td">{fmtDate(c.dueDate)}</td>
                          <td className="td">{money(amount)}</td>
                          <td className="td">{badge}</td>
                          <td className="td">{fmtDate(c.paidAt)}</td>
                          <td className="td">{c.note ?? '—'}</td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </main>
    </Protected>
  )
}
