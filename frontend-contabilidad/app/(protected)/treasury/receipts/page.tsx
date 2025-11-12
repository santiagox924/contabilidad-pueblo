// frontend-contabilidad/app/(protected)/treasury/receipts/page.tsx
'use client'

import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import { api } from '@/lib/api'
import { money, toNum } from '@/lib/format'
import { useQuery, useMutation, useQueryClient, useQueries } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

// 🔹 Métodos de pago (helpers al backend)
import {
  listPaymentMethods,
  createPaymentMethod,
  type PaymentMethod,
} from '@/lib/treasury'

// ---------- Tipos ----------
type PartyType = 'CLIENT'|'PROVIDER'|'EMPLOYEE'|'OTHER'
type Party = { id: number; name: string; type: PartyType; document?: string | null }

type SalesListItem = { id: number; number: number; issueDate: string; total: number; thirdPartyId?: number }
type SalesListResponse = {
  items: SalesListItem[]
  total: number
  pages: number
}

type Installment = {
  id: number
  number: number
  dueDate: string
  amount: number
  paidAmount: number
  status: 'PENDING'|'PARTIALLY_PAID'|'PAID'
}

type SalesDetail = {
  id: number
  number: number
  issueDate: string
  total: number
  ar?: {
    balance: number
    installments: Installment[]
  } | null
  creditMarkupPct?: number | null
}

// Payload que enviamos al API
type ReceiptDto = {
  thirdPartyId: number
  date?: string
  methodId?: number      // ⬅️ usamos id de método, no string libre
  total: number
  note?: string
  // NUEVO: estrategia de reprogramación
  reschedule?: 'KEEP' | 'MOVE_NEAREST'
  allocations: { invoiceId: number; installmentId?: number; amount: number }[]
}

// ---------- Utils ----------
const fmtDate = (s?: string | null) => {
  if (!s) return '—'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s! : d.toISOString().slice(0, 10)
}
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

const rnd = (n: any) => Math.round((typeof n === 'number' ? n : Number(n || 0)) * 100) / 100
const clamp0 = (n: any) => Math.max(0, rnd(n))

function pendingRounded(i: Installment) {
  return clamp0(rnd(i.amount) - rnd(i.paidAmount))
}

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

/**
 * Distribuye un monto entre cuotas en orden.
 * - creditPct: aumenta el pendiente "visible" (preview/sugerencias) de cada cuota.
 * - Siempre se limita a no exceder el pendiente real ni el saldo disponible.
 */
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
    const pendBase = pendingRounded(i)               // pendiente real redondeado
    if (pendBase <= 0) continue
    const pendAdj = rnd(pendBase * (1 + (creditPct || 0) / 100)) // pendiente "con recargo" solo para vista
    const payView = Math.min(remaining, pendAdj)
    const payApi = Math.min(payView, pendBase)       // jamás exceder pendiente real
    const afterView = Math.max(0, pendAdj - payView)
    lines.push({ inst: i, payView, payApi, afterView })
    remaining -= payView
  }
  return { lines, leftover: remaining }
}

function capByAvailable(amount: number, available: number) {
  return Math.max(0, Math.min(rnd(amount), rnd(available)))
}

// ---------- Data hooks ----------
function useParties() {
  return useQuery({
    queryKey: ['parties'],
    queryFn: async () => {
      const { data } = await api.get<Party[]>('/parties')
      return data.filter(p => p.type === 'CLIENT')
    }
  })
}

function useSalesByClient(thirdPartyId?: number) {
  return useQuery({
    enabled: !!thirdPartyId,
    queryKey: ['sales-by-client', thirdPartyId],
    queryFn: async () => {
      const { data } = await api.get<SalesListResponse>('/sales', { params: { page: 1, pageSize: 100, thirdPartyId } })
      return data.items
    }
  })
}

function useSalesDetail(ids: number[] | undefined) {
  const queries = useQueries({
    queries: (ids ?? []).map((id) => ({
      queryKey: ['sale-detail', id],
      queryFn: async () => {
        const { data } = await api.get<SalesDetail>(`/sales/${id}`)
        return data
      },
      enabled: !!id
    }))
  })
  return queries
}

// ---------- Página ----------
export default function Page() {
  // Declaramos qc UNA sola vez (👈 corregido: no volver a declararlo)
  const qc = useQueryClient()

  // cliente seleccionado / búsqueda
  const [q, setQ] = useState('')
  const [thirdPartyId, setThirdPartyId] = useState<number | undefined>(undefined)
  const [selectedClient, setSelectedClient] = useState<Party | undefined>(undefined)

  // filtros varios
  const [date, setDate] = useState<string | undefined>(undefined)
  const [methodId, setMethodId] = useState<number | undefined>(undefined) // ⬅️ id del método
  const [note, setNote] = useState<string | undefined>(undefined)
  const [creditPct, setCreditPct] = useState<number>(0)

  // totales y allocations
  const [total, setTotal] = useState<number>(0)
  // NUEVO: estrategia de reprogramación de cuotas
  const [reschedule, setReschedule] = useState<'KEEP'|'MOVE_NEAREST'>('KEEP')
  const [allocs, setAllocs] = useState<Array<{
    invoiceId: number
    invoiceNumber?: number
    amount: number
    available: number
    installmentId?: number
    installments?: Installment[]
  }>>([])

  // 🔹 Métodos de pago
  const pmQuery = useQuery({
    queryKey: ['payment-methods'],
    queryFn: () => listPaymentMethods({ active: true }),
  })
  const paymentMethods: PaymentMethod[] = pmQuery.data ?? []

  const { data: parties, isLoading: loadingParties } = useParties()
  const clients = useMemo(() => {
    const qq = q.trim().toLowerCase()
    const base = (parties ?? [])
    if (!qq) return base
    return base.filter(p =>
      p.name.toLowerCase().includes(qq) ||
      (p.document ?? '').toLowerCase().includes(qq)
    )
  }, [parties, q])

  const invoicesQuery = useSalesByClient(thirdPartyId)
  const invoices = invoicesQuery.data

  const detailQueries = useSalesDetail(invoices?.map(i => i.id))
  const detailMap = useMemo(() => {
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
      const balance = clamp0(q.data.ar?.balance)
      const inst = q.data.ar?.installments ?? []
      // próxima cuota con pendiente > 0
      const list = (inst ?? [])
        .map(i => ({ ...i, _pending: pendingRounded(i) }))
        .filter(i => i._pending > 0)
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      const next = list[0]
      const nextDue = next ? fmtDate(next.dueDate) : undefined
      const overdue = next && startOfDay(new Date(next.dueDate)) < today
      const nextPendRaw = next ? pendingRounded(next) : undefined
      // Mostrar mínimo entre pendiente de cuota y saldo de factura
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

  // Total del recibo = suma de lo que el usuario escribe en "Valor a cobrar"
  const allocTotal = useMemo(() => allocs.reduce((acc, r) => acc + (rnd(r.amount)), 0), [allocs])
  useEffect(() => {
    // Mantener total en sync con lo que el usuario digitó en cada allocation
    setTotal(allocTotal)
  }, [allocTotal])

  // ----- Lógica: mostrar reprogramación solo si total > valor de más de 2 próximas cuotas
  const twoNextInstallmentsSum = useMemo(() => {
    const items: { due: number; pending: number }[] = []
    for (const a of allocs) {
      const base = (a.installments ?? [])
        .map(i => ({ ...i, _pending: pendingRounded(i) }))
        .filter(i => i._pending > 0)
        .sort((x, y) => new Date(x.dueDate).getTime() - new Date(y.dueDate).getTime())
      for (const i of base) {
        items.push({ due: new Date(i.dueDate).getTime(), pending: pendingRounded(i) })
      }
    }
    if (items.length < 2) return Number.POSITIVE_INFINITY
    items.sort((a, b) => a.due - b.due)
    return rnd(items[0].pending) + rnd(items[1].pending)
  }, [allocs])

  const showReschedule = useMemo(() => {
    return rnd(allocTotal) > rnd(twoNextInstallmentsSum)
  }, [allocTotal, twoNextInstallmentsSum])

  // ---------- Mutations ----------
  const mutation = useMutation({
    mutationFn: async (payload: ReceiptDto) => {
      const { data } = await api.post('/treasury/receipts', payload)
      return data
    },
    onSuccess: async () => {
      // Refrescar lista de facturas del cliente
      await qc.invalidateQueries({ queryKey: ['sales-by-client', thirdPartyId] })
      await qc.refetchQueries({ queryKey: ['sales-by-client', thirdPartyId] })

      // Refrescar detalles de cada factura abierta (saldos/cuotas)
      await qc.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'sale-detail'
      })
      await qc.refetchQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'sale-detail'
      })

      alert('Recibo creado correctamente')

      // limpiar estado
      setAllocs([])
      setTotal(0)
      setNote(undefined)
      setMethodId(undefined)
    },
    onError: (e: any) => {
      console.error(e)
      alert(e?.response?.data?.message ?? 'Error al crear el recibo')
    }
  })

  // ---------- Acciones ----------
  function chooseClient(p: Party) {
    setThirdPartyId(p.id)
    setSelectedClient(p)
    setAllocs([])
    setTotal(0)
  }

  function addAllocation(inv: SalesListItem) {
    const det = detailMap.get(inv.id)
    const available = det ? det.balance : inv.total
    if (available <= 0) return
    setAllocs(prev => {
      if (prev.some(x => x.invoiceId === inv.id)) return prev
      return [...prev, {
        invoiceId: inv.id,
        invoiceNumber: inv.number,
        amount: Math.min(available, det?.nextPending ?? available),
        available: available,
        installments: det?.installments ?? [],
      }]
    })
  }

  function removeAlloc(idx: number) {
    setAllocs(prev => prev.filter((_,i)=>i!==idx))
  }

  function onChangeAmount(idx: number, raw: string) {
    const val = clamp0(toNum(raw))
    setAllocs(prev => prev.map((a,i) => i===idx ? { ...a, amount: val } : a))
  }

  function onSelectInstallment(idx: number, installmentId?: number) {
    setAllocs(prev => prev.map((a,i) => i===idx ? { ...a, installmentId } : a))
  }

  async function quickCreateMethod() {
    const name = window.prompt('Nombre del nuevo método (Efectivo, Banco, Nequi, etc.)')
    if (!name || !name.trim()) return
    const created = await createPaymentMethod({ name: name.trim(), active: true })
    await pmQuery.refetch()
    setMethodId(created.id)
  }

  function submit() {
    if (!thirdPartyId) return alert('Selecciona un cliente')
    if (allocs.length === 0) return alert('Agrega al menos una factura')
    if (allocTotal <= 0) return alert('El total debe ser mayor a 0')

    const finalAllocs: ReceiptDto['allocations'] = []
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
      // Si no había cuotas o no se distribuyó arriba, asignamos directo a la factura
      finalAllocs.push({ invoiceId: a.invoiceId, amount: rnd(amount) })
    }

    const payload: ReceiptDto = {
      thirdPartyId,
      date,
      methodId,                          // ⬅️ id del método al backend
      total: rnd(allocTotal),            // total = suma de "Valor a cobrar"
      note,
      reschedule: showReschedule ? reschedule : 'KEEP', // si no supera 2 cuotas, mantener
      allocations: finalAllocs,
    }

    mutation.mutate(payload)
  }

  // ---------- Render ----------
  return (
    <Protected>
      <Navbar />
      <main className="container py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">Recibos de caja</h1>
          <Link className="text-sm text-gray-600 underline" href="/treasury">Volver</Link>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Selector de cliente */}
          <section className="md:col-span-2 space-y-6">
            <div className="border rounded-lg p-4 bg-white">
              <h2 className="font-semibold mb-3">Cliente</h2>
              <div className="flex gap-2 mb-3">
                <input className="input flex-1" placeholder="Buscar por nombre o documento…" value={q} onChange={e=>setQ(e.target.value)} />
              </div>
              <div className="max-h-56 overflow-auto border rounded-md">
                {loadingParties ? (
                  <div className="p-3 text-sm text-gray-500">Cargando clientes…</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr><th className="text-left p-2">Nombre</th><th className="text-left p-2">Documento</th><th className="p-2"></th></tr>
                    </thead>
                    <tbody>
                      {(clients ?? []).map(c => (
                        <tr key={c.id} className="border-t">
                          <td className="p-2">{c.name}</td>
                          <td className="p-2">{c.document ?? '—'}</td>
                          <td className="p-2 text-right">
                            <button className="btn" onClick={() => chooseClient(c)}>Elegir</button>
                          </td>
                        </tr>
                      ))}
                      {(clients ?? []).length === 0 && (
                        <tr><td className="p-3 text-sm text-gray-500" colSpan={3}>No hay clientes</td></tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Facturas del cliente */}
            <div className="border rounded-lg p-4 bg-white">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold">Facturas del cliente</h2>
                {selectedClient && <div className="text-sm text-gray-600">Cliente: <span className="font-medium">{selectedClient.name}</span> {selectedClient.document ? `(${selectedClient.document})` : ''}</div>}
              </div>

              {!thirdPartyId && <div className="text-sm text-gray-500">Selecciona un cliente para ver sus facturas</div>}
              {thirdPartyId && invoicesQuery.isLoading && <div className="text-sm text-gray-500">Cargando facturas…</div>}

              {thirdPartyId && invoices && invoices.length > 0 && (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-left p-2">#</th>
                      <th className="text-left p-2">Fecha</th>
                      <th className="text-right p-2">Total</th>
                      <th className="text-left p-2">Próxima cuota</th>
                      <th className="text-right p-2">Saldo</th>
                      <th className="p-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv, idx) => {
                      const det = detailQueries[idx]
                      const loadingDet = det.isLoading
                      const info = detailMap.get(inv.id)
                      const balance = info?.balance ?? Math.max(0, inv.total)
                      const nextDue = info?.nextDueDate
                      const nextPending = info?.nextPending
                      const overdue = info?.overdue
                      const isPaid = rnd(balance) <= 0

                      return (
                        <tr key={inv.id} className="border-t">
                          <td className="p-2 font-medium">#{inv.number}</td>
                          <td className="p-2">{fmtDate(inv.issueDate)}</td>
                          <td className="p-2 text-right">{money(inv.total)}</td>
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
                          <td className="p-2 text-right">{loadingDet ? '…' : money(rnd(balance))}</td>
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
          </section>

          {/* Panel derecho: armado del recibo */}
          <aside className="space-y-4">
            <div className="border rounded-lg p-4 bg-white">
              <h2 className="font-semibold mb-3">Recibo</h2>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  <span className="text-gray-600">Fecha</span>
                  <input type="date" className="input w-full" value={date ?? ''} onChange={(e)=>setDate(e.target.value || undefined)} />
                </label>
                <label className="text-sm">
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
                <label className="text-sm col-span-2">
                  <span className="text-gray-600">Nota</span>
                  <input className="input w-full" value={note ?? ''} onChange={(e)=>setNote(e.target.value || undefined)} placeholder="Observaciones (opcional)" />
                </label>
              </div>

              {/* Lista de allocations */}
              {allocs.length === 0 ? (
                <div className="text-sm text-gray-500 mt-3">Agrega facturas desde la izquierda…</div>
              ) : (
                <div className="space-y-3 mt-3">
                  {allocs.map((a, idx) => {
                    const selectable = orderedInstallments(a.installments)
                    return (
                      <div key={a.invoiceId} className="border rounded-md p-3">
                        <div className="flex items-center justify-between">
                          <div className="text-sm">
                            <div className="font-medium">Factura #{a.invoiceNumber ?? a.invoiceId}</div>
                            {selectedClient && (
                              <div className="text-gray-600">
                                Cliente: <span className="font-medium">{selectedClient.name}</span>{' '}
                                {selectedClient.document ? `(${selectedClient.document})` : ''}
                              </div>
                            )}
                            {!Number.isFinite(a.available) ? null : (
                              <div className="text-gray-600">Saldo disponible: {money(rnd(a.available))}</div>
                            )}
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
                            <div className="text-xs text-gray-500 mt-2">No hay cuotas con saldo pendiente.</div>
                          )
                        )}

                        <label className="block text-sm mt-2">
                          <span className="text-gray-600">Valor a cobrar</span>
                          <input
                            className="input w-full"
                            value={a.amount}
                            onChange={(e)=>onChangeAmount(idx, e.target.value)}
                            inputMode="decimal"
                          />
                        </label>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Totales */}
              <div className="mt-3 border-t pt-3 flex items-center justify-between text-sm">
                <div className="text-gray-600">Total del recibo</div>
                <div className="font-semibold">{money(rnd(total))}</div>
              </div>

              {/* NUEVO: Reprogramación: solo visible si total > suma de 2 próximas cuotas */}
              {showReschedule && (
                <div className="mt-4 space-y-2">
                  <label className="block text-sm text-gray-600">Reprogramación de próximas cuotas</label>
                  <div className="flex gap-3">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="radio"
                        name="reschedule"
                        value="KEEP"
                        checked={reschedule === 'KEEP'}
                        onChange={() => setReschedule('KEEP')}
                      />
                      <span>Mantener fechas</span>
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="radio"
                        name="reschedule"
                        value="MOVE_NEAREST"
                        checked={reschedule === 'MOVE_NEAREST'}
                        onChange={() => setReschedule('MOVE_NEAREST')}
                      />
                      <span>Mover a la más cercana</span>
                    </label>
                  </div>
                </div>
              )}

              <button className="btn w-full mt-4" onClick={submit} disabled={mutation.isPending}>
                {mutation.isPending ? 'Guardando…' : 'Crear recibo'}
              </button>
            </div>
          </aside>
        </div>
      </main>
    </Protected>
  )
}
