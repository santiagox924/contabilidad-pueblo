'use client'

import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import { api } from '@/lib/api'
import { money } from '@/lib/format'
import { USER_ROLES } from '@/lib/roles'
import { useEffect, useMemo, useState } from 'react'

type Party = { id: number; name: string; document?: string | null }
type PurchaseRow = {
  id: number
  number?: number | null
  thirdPartyId: number
  thirdParty?: Party | null
  issueDate: string
  dueDate?: string | null
  paymentType?: 'CASH' | 'CREDIT' | string | null
  status?: string | null
  subtotal?: number | string | null
  tax?: number | string | null
  total?: number | string | null
}

function normalizeArray(res: any): any[] {
  const x = res && typeof res === 'object' && 'data' in res ? (res as any).data : res
  if (Array.isArray(x)) return x
  if (!x || typeof x !== 'object') return []
  if (Array.isArray((x as any).items)) return (x as any).items
  if (Array.isArray((x as any).data)) return (x as any).data
  if (Array.isArray((x as any).results)) return (x as any).results
  return []
}

export default function PurchasesPage() {
  const [rows, setRows] = useState<PurchaseRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // filtros simples
  const [q, setQ] = useState('')
  const [from, setFrom] = useState<string>('')
  const [to, setTo] = useState<string>('')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams()
      if (q.trim()) qs.set('q', q.trim())
      if (from) qs.set('from', from)
      if (to) qs.set('to', to)
      const url = '/purchases' + (qs.toString() ? `?${qs.toString()}` : '')
      const res = await api.get(url)
      setRows(normalizeArray(res))
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.message ?? 'No se pudieron cargar las compras')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, []) // carga inicial

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return rows
    return rows.filter(r => {
      const name = r.thirdParty?.name?.toLowerCase() ?? ''
      const doc = r.thirdParty?.document?.toLowerCase() ?? ''
      const nro = (r.number != null ? String(r.number) : String(r.id)).toLowerCase()
      return name.includes(term) || doc.includes(term) || nro.includes(term)
    })
  }, [rows, q])

  return (
    <Protected roles={[USER_ROLES.PURCHASING, USER_ROLES.ADMINISTRATOR, USER_ROLES.SUPER_ADMIN, USER_ROLES.ACCOUNTANT]}>
      <Navbar />
      <main className="container py-8 space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold">Compras</h1>
          <div className="flex gap-2">
            <a className="btn btn-secondary" href="/purchases/account-settings">
              Modificación de cuentas
            </a>
            <a className="btn btn-primary" href="/purchases/new-bill">
              Nueva compra
            </a>
          </div>
        </div>

        <section className="card space-y-3">
          <div className="grid md:grid-cols-4 gap-3">
            <div>
              <label className="label">Buscar</label>
              <input
                className="input"
                placeholder="Proveedor, doc. o #"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Desde</label>
              <input type="date" className="input" value={from} onChange={e=>setFrom(e.target.value)} />
            </div>
            <div>
              <label className="label">Hasta</label>
              <input type="date" className="input" value={to} onChange={e=>setTo(e.target.value)} />
            </div>
            <div className="flex items-end gap-2">
              <button className="btn" onClick={load} disabled={loading}>
                {loading ? 'Cargando…' : 'Aplicar'}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => { setQ(''); setFrom(''); setTo(''); load() }}
              >
                Limpiar
              </button>
            </div>
          </div>

          {error && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

          <div className="overflow-auto">
            <table className="table">
              <thead>
                <tr>
                  <th className="th">#</th>
                  <th className="th">Fecha</th>
                  <th className="th">Proveedor</th>
                  <th className="th">Pago</th>
                  <th className="th">Estado</th>
                  <th className="th">Total</th>
                  <th className="th">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(r => (
                  <tr key={r.id}>
                    <td className="td whitespace-nowrap">{r.number ?? r.id}</td>
                    <td className="td whitespace-nowrap">{new Date(r.issueDate).toISOString().slice(0,10)}</td>
                    <td className="td">
                      {r.thirdParty?.name ?? `#${r.thirdPartyId}`}
                      {r.thirdParty?.document ? ` · ${r.thirdParty.document}` : ''}
                    </td>
                    <td className="td">{r.paymentType ?? '—'}</td>
                    <td className="td">{r.status ?? '—'}</td>
                    <td className="td whitespace-nowrap">{money(Number(r.total ?? 0))}</td>
                    <td className="td">
                      <a className="btn btn-sm" href={`/purchases/${r.id}`}>Abrir</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && !filtered.length && (
              <p className="text-gray-600 mt-2">Sin resultados.</p>
            )}
            {loading && <p className="text-gray-600 mt-2">Cargando…</p>}
          </div>
        </section>
      </main>
    </Protected>
  )
}
