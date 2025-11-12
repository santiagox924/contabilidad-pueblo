'use client'
import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  AgingResponse,
  fetchAging,
  buildAgingExportUrl,
} from '@/lib/accounting-reports'
import { money } from '@/lib/format'

type Scope = 'AR' | 'AP'

type AgingRow = AgingResponse['rows'][number]

function todayISO() { return new Date().toISOString().slice(0,10) }

export default function AgingReportPage() {
  const [asOf, setAsOf] = useState(todayISO())
  const [scope, setScope] = useState<Scope>('AR')
  const [rows, setRows] = useState<AgingRow[]>([])
  const [totals, setTotals] = useState<AgingResponse['totals']>({ current: 0, d30: 0, d60: 0, d90: 0, d90p: 0 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true); setError(null)
    try {
      const response = await fetchAging({ asOf, scope })
      setRows(response.rows)
      setTotals(response.totals)
    } catch (e:any) {
      setError(e?.response?.data?.message || e?.message || 'Error cargando antigüedad de saldos')
      setRows([])
      setTotals({ current: 0, d30: 0, d60: 0, d90: 0, d90p: 0 })
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const exportUrl = useMemo(() => buildAgingExportUrl({ asOf, scope }), [asOf, scope])

  function onSubmit(e: React.FormEvent){ e.preventDefault(); load() }

  return (
    <Protected>
      <Navbar />
      <main className="container mx-auto p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Antigüedad de saldos</h1>
            <p className="text-sm text-gray-500">Vencimientos de {scope === 'AR' ? 'clientes' : 'proveedores'}.</p>
          </div>
          <div className="flex items-center gap-2">
            <a href={exportUrl} className="btn btn-outline">Exportar CSV</a>
            <Link href="/accounting" className="btn btn-ghost">Volver</Link>
          </div>
        </div>

        <form onSubmit={onSubmit} className="mb-4 rounded-2xl border bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div>
              <label className="block text-sm font-medium mb-1">Corte</label>
              <input type="date" className="input input-bordered w-full rounded-xl" value={asOf} onChange={e=>setAsOf(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Ámbito</label>
              <select className="input input-bordered w-full rounded-xl" value={scope} onChange={e=>setScope(e.target.value as Scope)}>
                <option value="AR">Cuentas por cobrar</option>
                <option value="AP">Cuentas por pagar</option>
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
                <th className="px-4 py-2 text-left text-sm">Tercero</th>
                <th className="px-4 py-2 text-right text-sm">Corriente</th>
                <th className="px-4 py-2 text-right text-sm">1-30</th>
                <th className="px-4 py-2 text-right text-sm">31-60</th>
                <th className="px-4 py-2 text-right text-sm">61-90</th>
                <th className="px-4 py-2 text-right text-sm">90+</th>
                <th className="px-4 py-2 text-right text-sm">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (<tr><td colSpan={7} className="px-4 py-4 text-center text-gray-500">Cargando…</td></tr>)}
              {!loading && rows.map((r,i)=> (
                <tr key={`${r.thirdPartyId || 'row'}-${i}`}>
                  <td className="px-4 py-2 text-sm">{r.thirdPartyName || '-'}</td>
                  <td className="px-4 py-2 text-sm text-right">{money(r.current, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2 text-sm text-right">{money(r.d30, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2 text-sm text-right">{money(r.d60, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2 text-sm text-right">{money(r.d90, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2 text-sm text-right">{money(r.d90p, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2 text-sm text-right">{money(r.current + r.d30 + r.d60 + r.d90 + r.d90p, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
              ))}
              {!loading && rows.length === 0 && !error && (
                <tr><td colSpan={7} className="px-4 py-4 text-center text-gray-500">Sin datos.</td></tr>
              )}
            </tbody>
            {!loading && rows.length>0 && (
              <tfoot className="bg-gray-50">
                <tr>
                  <td className="px-4 py-2" colSpan={1}>Totales</td>
                  <td className="px-4 py-2 text-right font-semibold">{money(totals.current, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2 text-right font-semibold">{money(totals.d30, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2 text-right font-semibold">{money(totals.d60, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2 text-right font-semibold">{money(totals.d90, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2 text-right font-semibold">{money(totals.d90p, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2 text-right font-semibold">{money(totals.current + totals.d30 + totals.d60 + totals.d90 + totals.d90p, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </main>
    </Protected>
  )
}

