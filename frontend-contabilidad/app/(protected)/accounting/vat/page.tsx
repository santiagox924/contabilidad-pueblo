'use client'
import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'

type Kind = 'SALES' | 'PURCHASES'

interface VatRow {
  date?: string
  base?: number
  vat?: number
  total?: number
  doc?: string
}

function firstDayOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}
function lastDayOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
}
function fmtMoney(n?: number) {
  return Number(n || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function VatReportPage() {
  const [from, setFrom] = useState(firstDayOfMonth())
  const [to, setTo] = useState(lastDayOfMonth())
  const [kind, setKind] = useState<Kind>('SALES')
  const [rows, setRows] = useState<VatRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true); setError(null)
    try {
      const res = await api.get<VatRow[]>('/accounting/vat', { params: { from, to, kind } })
      setRows(Array.isArray(res.data) ? res.data : [])
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Error cargando reporte de IVA')
      setRows([])
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const exportUrl = useMemo(() => {
    const qs = new URLSearchParams({ from, to, kind }).toString()
    return `/accounting/export/vat.csv?${qs}`
  }, [from, to, kind])

  const totals = useMemo(() => {
    const base = rows.reduce((a, r) => a + (Number(r.base) || 0), 0)
    const vat = rows.reduce((a, r) => a + (Number(r.vat) || 0), 0)
    const total = rows.reduce((a, r) => a + (Number(r.total) || 0), 0)
    return { base, vat, total }
  }, [rows])

  function onSubmit(e: React.FormEvent) { e.preventDefault(); load() }

  return (
    <Protected>
      <Navbar />
      <main className="container mx-auto p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">IVA</h1>
            <p className="text-sm text-gray-500">Resumen de IVA en {kind === 'SALES' ? 'ventas' : 'compras'}.</p>
          </div>
          <div className="flex items-center gap-2">
            <a href={exportUrl} className="btn btn-outline">Exportar CSV</a>
            <Link href="/accounting" className="btn btn-ghost">Volver</Link>
          </div>
        </div>

        <form onSubmit={onSubmit} className="mb-4 rounded-2xl border bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div>
              <label className="block text-sm font-medium mb-1">Desde</label>
              <input type="date" className="input input-bordered w-full rounded-xl" value={from} onChange={e=>setFrom(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Hasta</label>
              <input type="date" className="input input-bordered w-full rounded-xl" value={to} onChange={e=>setTo(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Tipo</label>
              <select className="input input-bordered w-full rounded-xl" value={kind} onChange={e=>setKind(e.target.value as Kind)}>
                <option value="SALES">Ventas</option>
                <option value="PURCHASES">Compras</option>
              </select>
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
                <th className="px-4 py-2 text-left text-sm">Fecha</th>
                <th className="px-4 py-2 text-left text-sm">Documento</th>
                <th className="px-4 py-2 text-right text-sm">Base</th>
                <th className="px-4 py-2 text-right text-sm">IVA</th>
                <th className="px-4 py-2 text-right text-sm">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr><td colSpan={5} className="px-4 py-4 text-center text-gray-500">Cargando…</td></tr>
              )}
              {!loading && rows.map((r, i) => (
                <tr key={`${r.date}-${r.doc}-${i}`}>
                  <td className="px-4 py-2 text-sm">{r.date || '-'}</td>
                  <td className="px-4 py-2 text-sm">{r.doc || '-'}</td>
                  <td className="px-4 py-2 text-sm text-right">{fmtMoney(r.base)}</td>
                  <td className="px-4 py-2 text-sm text-right">{fmtMoney(r.vat)}</td>
                  <td className="px-4 py-2 text-sm text-right">{fmtMoney(r.total)}</td>
                </tr>
              ))}
              {!loading && rows.length === 0 && !error && (
                <tr><td colSpan={5} className="px-4 py-4 text-center text-gray-500">Sin datos.</td></tr>
              )}
            </tbody>
            {!loading && rows.length > 0 && (
              <tfoot className="bg-gray-50">
                <tr>
                  <td className="px-4 py-2" colSpan={2}>Totales</td>
                  <td className="px-4 py-2 text-right font-semibold">{fmtMoney(totals.base)}</td>
                  <td className="px-4 py-2 text-right font-semibold">{fmtMoney(totals.vat)}</td>
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

