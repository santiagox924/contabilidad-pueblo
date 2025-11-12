'use client'
import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'

interface CogsRow {
  item?: string
  qty?: number
  cost?: number
  total?: number
}

function firstDayOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}
function lastDayOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
}
function fmtMoney(n?: number) { return Number(n||0).toLocaleString('es-CO',{minimumFractionDigits:2,maximumFractionDigits:2}) }

export default function CogsPage() {
  const [from, setFrom] = useState(firstDayOfMonth())
  const [to, setTo] = useState(lastDayOfMonth())
  const [rows, setRows] = useState<CogsRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true); setError(null)
    try {
      const res = await api.get<CogsRow[]>('/accounting/cogs', { params: { from, to } })
      setRows(Array.isArray(res.data) ? res.data : [])
    } catch (e:any) {
      setError(e?.response?.data?.message || e?.message || 'Error cargando COGS')
      setRows([])
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const exportUrl = useMemo(() => {
    const qs = new URLSearchParams({ from, to }).toString()
    return `/accounting/export/cogs.csv?${qs}`
  }, [from, to])

  const totals = useMemo(() => {
    const total = rows.reduce((a,r)=> a + (Number(r.total)||0), 0)
    return { total }
  }, [rows])

  function onSubmit(e: React.FormEvent){ e.preventDefault(); load() }

  return (
    <Protected>
      <Navbar />
      <main className="container mx-auto p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">COGS / Costo de ventas</h1>
            <p className="text-sm text-gray-500">Costo de ventas por ítem en el periodo.</p>
          </div>
          <div className="flex items-center gap-2">
            <a href={exportUrl} className="btn btn-outline">Exportar CSV</a>
            <Link href="/accounting" className="btn btn-ghost">Volver</Link>
          </div>
        </div>

        <form onSubmit={onSubmit} className="mb-4 rounded-2xl border bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="block text-sm font-medium mb-1">Desde</label>
              <input type="date" className="input input-bordered w-full rounded-xl" value={from} onChange={e=>setFrom(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Hasta</label>
              <input type="date" className="input input-bordered w-full rounded-xl" value={to} onChange={e=>setTo(e.target.value)} />
            </div>
            <div className="flex items-end">
              <button type="submit" className="btn btn-primary">Aplicar</button>
            </div>
          </div>
          {error && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-red-700">{error}</div>}
        </form>

        <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-sm">Ítem</th>
                <th className="px-4 py-2 text-right text-sm">Cantidad</th>
                <th className="px-4 py-2 text-right text-sm">Costo unitario</th>
                <th className="px-4 py-2 text-right text-sm">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (<tr><td colSpan={4} className="px-4 py-4 text-center text-gray-500">Cargando…</td></tr>)}
              {!loading && rows.map((r,i)=> (
                <tr key={`${r.item}-${i}`}>
                  <td className="px-4 py-2 text-sm">{r.item || '-'}</td>
                  <td className="px-4 py-2 text-sm text-right">{r.qty}</td>
                  <td className="px-4 py-2 text-sm text-right">{fmtMoney(r.cost)}</td>
                  <td className="px-4 py-2 text-sm text-right">{fmtMoney(r.total)}</td>
                </tr>
              ))}
              {!loading && rows.length===0 && !error && (
                <tr><td colSpan={4} className="px-4 py-4 text-center text-gray-500">Sin datos.</td></tr>
              )}
            </tbody>
            {!loading && rows.length>0 && (
              <tfoot className="bg-gray-50">
                <tr>
                  <td className="px-4 py-2" colSpan={3}>Totales</td>
                  <td className="px-4 py-2 text-right font-semibold">{fmtMoney(totals.total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </main>
    </Protected>
  )
}

