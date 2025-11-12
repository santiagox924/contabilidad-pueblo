// frontend-contabilidad/app/(protected)/treasury/payments/page.tsx
'use client'

import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import { api } from '@/lib/api'
import { money, toNum } from '@/lib/format'
import { useQuery, useMutation, useQueryClient, useQueries } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

// 🔹 Métodos de pago (helpers ya creados en lib/treasury.ts)
import {
  listPaymentMethods,
  createPaymentMethod,
  type PaymentMethod,
} from '@/lib/treasury'

// ---------- Tipos ----------
type PartyType = 'CLIENT'|'PROVIDER'|'EMPLOYEE'|'OTHER'
type Party = { id: number; name: string; type: PartyType; document?: string | null; roles?: PartyType[] }

type PurchListItem = { id: number; number: number; issueDate: string; total: number; thirdPartyId?: number }
type Installment = { id: number; number: number; dueDate: string; amount: any; paidAmount: any; status: 'PENDING'|'PARTIALLY_PAID'|'PAID' }
type PurchDetail = {
  id: number
  number: number
  issueDate: string
  total: any
  thirdPartyId?: number
  ap?: { balance: any; installments: Installment[] } | null
}

type AllocationRow = {
  invoiceId: number
  invoiceNumber?: number
  available?: number
  installmentId?: number
  amount: number
  installments?: Installment[]
}

type PaymentDto = {
  thirdPartyId: number
  date?: string
  methodId?: number     // ⬅️ ahora enviamos id del método
  total: number
  note?: string
  allocations: { invoiceId: number; installmentId?: number; amount: number }[]
}

// ---------- Utils ----------
const fmtDate = (s?: string | null) => {
  if (!s) return '—'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s! : d.toISOString().slice(0, 10)
}
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

const rnd = (n: any) => Math.round(Number(n) || 0)
const clamp0 = (n: any) => Math.max(0, rnd(toNum(n) ?? 0))
const capByAvailable = (amt: any, avail?: number) => {
  const intended = rnd(amt)
  const cap = (typeof avail === 'number') ? rnd(avail) : intended
  return Math.min(intended, cap)
}

const pendingOfInstallment = (i?: Installment) => {
  if (!i) return 0
  const amt = toNum(i.amount) ?? 0
  const paid = toNum(i.paidAmount) ?? 0
  return Math.max(0, amt - paid)
}
const pendingRounded = (i?: Installment) => rnd(pendingOfInstallment(i))

// Orden: vencidas primero, luego vigentes; si startId existe, comenzamos ahí
function orderedInstallments(inst: Installment[] | undefined, startId?: number) {
  const base = (inst ?? [])
    .map(i => ({ ...i, _pending: pendingRounded(i) }))
    .filter(i => i._pending > 0)

  const todayTs = startOfDay(new Date()).getTime()
  const overdue = base.filter(i => new Date(i.dueDate).getTime() < todayTs)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
  const upcoming = base.filter(i => new Date(i.dueDate).getTime() >= todayTs)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
  const ordered = [...overdue, ...upcoming]

  if (!startId) return ordered
  const idx = ordered.findIndex(i => i.id === startId)
  return idx > 0 ? [...ordered.slice(idx), ...ordered.slice(0, idx)] : ordered
}

function distributeAmount(
  inst: Installment[] | undefined,
  amount: number,
  startId?: number,
  creditPct: number = 0
) {
  let remaining = Math.max(0, rnd(amount))
  const lines: { inst: Installment, payView: number, payApi: number, afterView: number }[] = []

  for (const i of orderedInstallments(inst, startId)) {
    if (remaining <= 0) break
    const pendBase = pendingRounded(i)
    if (pendBase <= 0) continue
    const pendAdj = rnd(pendBase * (1 + (creditPct || 0) / 100))
    const payView = Math.min(remaining, pendAdj)
    const payApi = Math.min(payView, pendBase)
    const afterView = Math.max(0, pendAdj - payView)
    lines.push({ inst: i, payView, payApi, afterView })
    remaining -= payView
  }
  return { lines, leftover: remaining }
}

// ---------- Data hooks ----------
function useProviders() {
  return useQuery({
    queryKey: ['parties', 'providers'],
    queryFn: async () => {
      const { data } = await api.get<Party[]>('/parties', { params: { role: 'PROVIDER' } })
      // Mostrar todos los que tengan el rol PROVIDER en el array roles
      return data.filter(p => Array.isArray(p.roles) && p.roles.includes('PROVIDER'))
    }
  })
}

function usePurchasesByThirdParty(thirdPartyId?: number) {
  return useQuery({
    enabled: !!thirdPartyId,
    queryKey: ['purchases-by-third-party', thirdPartyId],
    queryFn: async () => {
      if (!thirdPartyId) return []
      const params: Record<string, any> = { pageSize: 50, thirdPartyId }
      const { data } = await api.get<{ items?: any[]; data?: any[] } | any[]>('/purchases', { params })
      const rows: any[] = (data as any)?.items ?? (data as any)?.data ?? (Array.isArray(data) ? data : [])
      return rows.filter((s: any) =>
        s?.thirdPartyId === thirdPartyId ||
        s?.partyId === thirdPartyId ||
        s?.providerId === thirdPartyId ||
        s?.thirdParty?.id === thirdPartyId ||
        s?.supplier?.id === thirdPartyId
      ) as PurchListItem[]
    },
    placeholderData: undefined,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    gcTime: 0,
  })
}

async function fetchPurchaseDetail(id: number): Promise<PurchDetail> {
  const { data } = await api.get<PurchDetail>(`/purchases/${id}`)
  return data
}

// ---------- Page ----------
export default function PaymentsPage() {
  const qc = useQueryClient()
  const [thirdPartyId, setThirdPartyId] = useState<number | undefined>(undefined)
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0,10))
  const [methodId, setMethodId] = useState<number | undefined>(undefined) // ⬅️ id del método
  const [note, setNote] = useState<string>('')
  const [total, setTotal] = useState<number>(0)
  const [allocs, setAllocs] = useState<AllocationRow[]>([])
  const [q, setQ] = useState('')
  const [creditPct, setCreditPct] = useState<number>(0) // Recargo crédito (%) para vista

  // 🔹 Métodos de pago
  const pmQuery = useQuery({
    queryKey: ['payment-methods'],
    queryFn: () => listPaymentMethods({ active: true }),
  })
  const paymentMethods: PaymentMethod[] = pmQuery.data ?? []

  const { data: providers, isFetching: loadingProviders } = useProviders()
  const provs = useMemo(() => {
    const rows = providers ?? []
    if (!q.trim()) return rows
    const qq = q.trim().toLowerCase()
    return rows.filter(p =>
      p.name.toLowerCase().includes(qq) ||
      (p.document ?? '').toLowerCase().includes(qq)
    )
  }, [providers, q])

  const { data: invoices, isFetching: loadingInvoices } = usePurchasesByThirdParty(thirdPartyId)

  const detailQueries = useQueries({
    queries: (invoices ?? []).map(inv => ({
      queryKey: ['purchase-detail', inv.id],
      queryFn: () => fetchPurchaseDetail(inv.id),
      enabled: !!thirdPartyId,
      staleTime: 60_000,
    }))
  })

  const invoiceDetailMap = useMemo(() => {
    const today = startOfDay(new Date())
    const map = new Map<number, {
      balance: number
      installments: Installment[]
      nextDueDate?: string
      nextPending?: number
      overdue?: boolean
    }>()
    detailQueries.forEach((q, idx) => {
      const inv = invoices?.[idx]
      if (!inv || !q.data) return
      const balance = clamp0(q.data.ap?.balance)
      const inst = q.data.ap?.installments ?? []
      const list = (inst ?? [])
        .map(i => ({ ...i, _pending: pendingRounded(i) }))
        .filter(i => i._pending > 0)
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      const next = list[0]
      const nextDue = next ? fmtDate(next?.dueDate) : undefined
      const overdue = next && startOfDay(new Date(next.dueDate)) < today
      const nextPendRaw = next ? pendingRounded(next) : undefined
      const nextPendShown = typeof nextPendRaw === 'number' ? Math.min(nextPendRaw, balance) : undefined
      map.set(inv.id, {
        balance,
        installments: inst,
        nextDueDate: nextDue,
        nextPending: nextPendShown,
        overdue: !!overdue
      })
    })
    return map
  }, [detailQueries, invoices])

  const allocTotal = useMemo(() => allocs.reduce((acc, r) => acc + rnd(r.amount), 0), [allocs])

  useEffect(() => {
    if (allocTotal && (total === 0 || total === allocTotal)) setTotal(allocTotal)
  }, [allocTotal]) // eslint-disable-line

  async function addAllocation(inv: PurchListItem) {
    let det = detailQueries.find((q, idx) => invoices?.[idx]?.id === inv.id)?.data as PurchDetail | undefined
    if (!det) det = await fetchPurchaseDetail(inv.id)

    const balance = clamp0(det.ap?.balance)
    if (balance <= 0) return
    setAllocs(prev => {
      if (prev.some(a => a.invoiceId === inv.id)) return prev
      const suggested = Math.min(balance, Math.max(0, total - allocTotal) || balance)
      return [...prev, {
        invoiceId: inv.id,
        invoiceNumber: det!.number,
        available: balance,
        amount: rnd(suggested),
        installments: det!.ap?.installments ?? []
      }]
    })
  }

  function updateAlloc(idx: number, patch: Partial<AllocationRow>) {
    setAllocs(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r))
  }
  function removeAlloc(idx: number) {
    setAllocs(prev => prev.filter((_, i) => i !== idx))
  }

  function onSelectInstallment(idx: number, installmentId?: number) {
    setAllocs(prev => {
      const row = prev[idx]; if (!row) return prev
      const chosen = row.installments?.find(i => i.id === installmentId)
      const left = chosen ? pendingRounded(chosen) : 0
      const leftAdj = rnd(left * (1 + (creditPct || 0) / 100))
      const capped = Math.min(leftAdj, row.available ?? leftAdj)
      const next = { ...row, installmentId: installmentId || undefined, amount: rnd(capped) }
      return prev.map((r, i) => (i === idx ? next : r))
    })
  }

  const mutation = useMutation({
    mutationFn: async (payload: PaymentDto) => {
      const { data } = await api.post('/treasury/payments', payload)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases-by-third-party'] })
      qc.invalidateQueries({ queryKey: ['purchase-detail'] })
      alert('Pago registrado con éxito')
      setAllocs([]); setTotal(0); setMethodId(undefined); setNote('')
    }
  })

  async function quickCreateMethod() {
    const name = window.prompt('Nombre del nuevo método (Banco, Transferencia, Efectivo, etc.)')
    if (!name || !name.trim()) return
    const created = await createPaymentMethod({ name: name.trim(), active: true })
    await pmQuery.refetch()
    setMethodId(created.id)
  }

  function submit() {
    if (!thirdPartyId) return alert('Selecciona un proveedor')
    if (allocs.length === 0) return alert('Agrega al menos una factura')
    if (allocTotal <= 0) return alert('El total debe ser mayor a 0')
    if (!methodId) return alert('Selecciona el método de pago')

    const finalAllocs: PaymentDto['allocations'] = []
    for (const a of allocs) {
      const amount = capByAvailable(a.amount, a.available)
      if ((a.installments?.length ?? 0) > 0) {
        const { lines } = distributeAmount(a.installments, amount, a.installmentId, creditPct)
        if (lines.length > 0) {
          for (const ln of lines) if (ln.payApi > 0)
            finalAllocs.push({ invoiceId: a.invoiceId, installmentId: ln.inst.id, amount: rnd(ln.payApi) })
          continue
        }
      }
      finalAllocs.push({ invoiceId: a.invoiceId, amount: rnd(amount) })
    }

    const payload: PaymentDto = {
      thirdPartyId,
      date,
      methodId, // ⬅️ enviamos id del método
      note: note || undefined,
      total: finalAllocs.reduce((s, x) => s + (x.amount || 0), 0),
      allocations: finalAllocs
    }
    mutation.mutate(payload)
  }

  return (
    <Protected>
      <Navbar />
      <main className="container py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">Pagos a proveedores</h1>
          <Link className="text-sm text-gray-600 underline" href="/treasury">Volver</Link>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Selector de proveedor */}
          <section className="md:col-span-2 space-y-6">
            <div className="border rounded-lg p-4 bg-white">
              <h2 className="font-semibold mb-3">Proveedor</h2>
              <div className="flex gap-2 mb-3">
                <input className="input flex-1" placeholder="Buscar por nombre o documento…" value={q} onChange={e=>setQ(e.target.value)} />
              </div>
              <div className="max-h-56 overflow-auto border rounded-md">
                {loadingProviders ? (
                  <div className="p-3 text-sm text-gray-500">Cargando proveedores…</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr><th className="text-left p-2">Nombre</th><th className="text-left p-2">Documento</th><th className="p-2"></th></tr>
                    </thead>
                    <tbody>
                      {(provs ?? []).map(c => (
                        <tr key={c.id} className="border-t">
                          <td className="p-2">{c.name}</td>
                          <td className="p-2">{c.document ?? '—'}</td>
                          <td className="p-2 text-right">
                            <button className={`btn ${thirdPartyId === c.id ? 'opacity-60' : ''}`} onClick={() => { setThirdPartyId(c.id); setAllocs([]) }}>
                              {thirdPartyId === c.id ? 'Seleccionado' : 'Seleccionar'}
                            </button>
                          </td>
                        </tr>
                      ))}
                      {(provs ?? []).length === 0 && <tr><td className="p-2 text-sm text-gray-500" colSpan={3}>Sin resultados</td></tr>}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Facturas del proveedor */}
            <div className="border rounded-lg p-4 bg-white">
              <h2 className="font-semibold mb-3">Facturas del proveedor</h2>
              {!thirdPartyId ? (
                <p className="text-sm text-gray-600">Selecciona un proveedor para listar facturas.</p>
              ) : (
                <div className="max-h-96 overflow-auto border rounded-md">
                  {loadingInvoices ? (
                    <div className="p-3 text-sm text-gray-500">Cargando facturas…</div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="text-left p-2">#</th>
                          <th className="text-left p-2">Fecha</th>
                          <th className="text-right p-2">Total</th>
                          <th className="text-right p-2">Saldo</th>
                          <th className="text-left p-2">Próx. vencimiento</th>
                          <th className="p-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {(invoices ?? []).map((inv, idx) => {
                          const det = invoiceDetailMap.get(inv.id)
                          const balance = clamp0(det?.balance ?? 0)
                          const nextDue = det?.nextDueDate
                          const nextPending = det?.nextPending
                          const overdue = det?.overdue
                          const loadingDet = detailQueries[idx]?.isFetching
                          const isPaid = balance <= 0

                          return (
                            <tr key={inv.id} className="border-t">
                              <td className="p-2">{inv.number}</td>
                              <td className="p-2">{fmtDate(inv.issueDate)}</td>
                              <td className="p-2 text-right">{money(rnd(inv.total))}</td>
                              <td className="p-2 text-right">{loadingDet ? '…' : money(rnd(balance))}</td>
                              <td className="p-2">
                                {loadingDet && <span className="text-sm text-gray-500">Calculando…</span>}
                                {!loadingDet && !isPaid && nextDue ? (
                                  <div className="flex items-center gap-2">
                                    <span>{nextDue}</span>
                                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full border ${overdue ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
                                      {overdue ? 'Atrasada' : 'Vigente'}
                                    </span>
                                    {typeof nextPending === 'number' && (
                                      <span className="text-xs text-gray-600">• Pend: {money(rnd(nextPending))}</span>
                                    )}
                                  </div>
                                ) : (!loadingDet && !isPaid && !nextDue) ? (
                                  <span className="text-sm text-gray-500">Sin cuotas pendientes</span>
                                ) : null}
                              </td>
                              <td className="p-2 text-right">
                                {loadingDet && <span className="text-sm text-gray-500">…</span>}
                                {!loadingDet && isPaid ? (
                                  <span className="inline-block text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600 border">Pagada</span>
                                ) : (
                                  !loadingDet && <button className="btn" onClick={() => addAllocation(inv)}>Agregar</button>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                        {(invoices ?? []).length === 0 && <tr><td className="p-2 text-sm text-gray-500" colSpan={6}>No hay facturas</td></tr>}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Formulario + Asignaciones */}
          <aside className="space-y-6">
            <div className="border rounded-lg p-4 bg-white space-y-3">
              <h2 className="font-semibold">Pago</h2>
              <label className="block text-sm">
                <span className="text-gray-600">Fecha</span>
                <input type="date" className="input w-full" value={date} onChange={e=>setDate(e.target.value)} />
              </label>

              <label className="block text-sm">
                <span className="text-gray-600">Método</span>
                <div className="flex gap-2">
                  <select
                    className="input w-full"
                    value={methodId ?? ''}
                    onChange={(e)=>setMethodId(e.target.value ? Number(e.target.value) : undefined)}
                  >
                    <option value="">{pmQuery.isLoading ? 'Cargando…' : '(Selecciona)'}</option>
                    {paymentMethods.map(pm => (
                      <option key={pm.id} value={pm.id}>{pm.name}</option>
                    ))}
                  </select>
                  <button type="button" className="btn btn-outline" onClick={quickCreateMethod}>
                    + Método
                  </button>
                </div>
                {paymentMethods.length === 0 && !pmQuery.isLoading && (
                  <p className="text-xs text-amber-600 mt-1">No hay métodos activos. Crea uno con “+ Método”.</p>
                )}
              </label>

              <label className="block text-sm">
                <span className="text-gray-600">Nota</span>
                <textarea className="input w-full" rows={2} value={note} onChange={e=>setNote(e.target.value)} />
              </label>

              {/* Recargo por crédito */}
              <label className="block text-sm">
                <span className="text-gray-600">Recargo por compra a crédito (%)</span>
                <input
                  type="number" min={0} step={1}
                  className="input w-full"
                  value={creditPct}
                  onChange={(e)=>setCreditPct(rnd(e.target.value))}
                />
              </label>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Total asignado</span>
                <span className="font-semibold">{money(rnd(allocTotal))}</span>
              </div>
            </div>

            <div className="border rounded-lg p-4 bg-white">
              <h3 className="font-semibold mb-2">Asignaciones</h3>
              {allocs.length === 0 ? (
                <p className="text-sm text-gray-600">Agrega facturas desde la lista.</p>
              ) : (
                <div className="space-y-3">
                  {allocs.map((a, idx) => {
                    const isPaid = (a.available ?? 0) <= 0
                    const previewAmount = capByAvailable(a.amount, a.available)
                    const dist = distributeAmount(a.installments, previewAmount, a.installmentId, creditPct)

                    const selectable = (a.installments ?? [])
                      .filter(i => pendingRounded(i) > 0)

                    return (
                      <div key={a.invoiceId} className="border rounded-md p-3">
                        <div className="flex items-center justify-between">
                          <div className="text-sm">
                            <div className="font-medium">Factura #{a.invoiceNumber ?? a.invoiceId}</div>
                            {!isPaid && <div className="text-gray-600">Saldo disponible: {money(rnd(a.available))}</div>}
                          </div>
                          <button className="text-sm text-red-600 underline" onClick={()=>removeAlloc(idx)}>Quitar</button>
                        </div>

                        {/* Selector de cuota (omite cuotas en $0) */}
                        {a.installments && a.installments.length > 0 && (
                          selectable.length > 0 ? (
                            <label className="block text-sm mt-2">
                              <span className="text-gray-600">Aplicar a cuota (opcional)</span>
                              <select
                                className="input w-full"
                                value={a.installmentId ?? ''}
                                onChange={(e) => {
                                  const val = e.target.value ? Number(e.target.value) : undefined
                                  onSelectInstallment(idx, val)
                                }}
                              >
                                <option value="">— Sin cuota específica —</option>
                                {selectable.map(i => {
                                  const due = fmtDate(i.dueDate)
                                  const left = pendingRounded(i)
                                  return <option key={i.id} value={i.id}>{`#${i.number} • vence ${due} • pendiente ${money(rnd(left))}`}</option>
                                })}
                              </select>
                            </label>
                          ) : (
                            <div className="mt-2 text-xs text-gray-600">Todas las cuotas pagadas.</div>
                          )
                        )}

                        {/* Vista previa de distribución por cuotas */}
                        {a.installments && a.installments.length > 0 && previewAmount > 0 && (
                          <div className="mt-2 rounded-md bg-gray-50 border text-xs p-2">
                            <div className="font-medium mb-1">Aplicación estimada</div>
                            {dist.lines.length === 0 ? (
                              <div className="text-gray-600">No hay cuotas pendientes.</div>
                            ) : (
                              <ul className="space-y-1">
                                {dist.lines.map(({ inst, payView, afterView }) => (
                                  <li key={inst.id} className="flex justify-between">
                                    <span>Cuota #{inst.number} • vence {fmtDate(inst.dueDate)}</span>
                                    <span>
                                      pagar {money(rnd(payView))} {afterView > 0 ? `→ saldo ${money(rnd(afterView))}` : '→ pagada'}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}

                        <label className="block text-sm mt-2">
                          <span className="text-gray-600">Monto a aplicar</span>
                          <input
                            type="number"
                            step={1}
                            min={0}
                            max={a.available ?? undefined}
                            className="input w-full"
                            value={a.amount}
                            onChange={(e)=>updateAlloc(idx, { amount: rnd(e.target.value) })}
                            onBlur={(e)=>updateAlloc(idx, { amount: rnd(e.target.value) })}
                          />
                        </label>
                      </div>
                    )
                  })}
                </div>
              )}

              <button className="btn w-full mt-4" onClick={submit} disabled={mutation.isPending}>
                {mutation.isPending ? 'Guardando…' : 'Registrar pago'}
              </button>
            </div>
          </aside>
        </div>
      </main>
    </Protected>
  )
}
