'use client'

import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'

interface BSItem {
  code: string
  name: string
  amount: number
}
interface BSGroup {
  title: string
  items: BSItem[]
  total?: number
}
interface BalanceSheetStructured {
  groups: BSGroup[]
  totalAssets?: number
  totalLiabilitiesEquity?: number
}
interface BalanceSheetFlat {
  assets?: BSItem[]
  liabilities?: BSItem[]
  equity?: BSItem[]
}
type BalanceSheetAPIResponse = BalanceSheetStructured | BalanceSheetFlat

function fmtMoney(n: number) {
  return Number(n || 0).toLocaleString('es-CO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function normalize(data: BalanceSheetAPIResponse): {
  groups: BSGroup[]
  totals: { assets: number; liabilitiesEquity: number }
} {
  // Caso 1: viene ya estructurado con groups
  if ('groups' in data && Array.isArray(data.groups)) {
    const groups = data.groups.map(g => ({
      ...g,
      total:
        typeof g.total === 'number'
          ? g.total
          : (g.items || []).reduce((acc, it) => acc + (Number(it.amount) || 0), 0),
    }))

    const assets =
      typeof (data as BalanceSheetStructured).totalAssets === 'number'
        ? (data as BalanceSheetStructured).totalAssets!
        : groups
            .filter(g => /activo/i.test(g.title))
            .reduce((acc, g) => acc + (g.total || 0), 0)

    const liabilitiesEquity =
      typeof (data as BalanceSheetStructured).totalLiabilitiesEquity === 'number'
        ? (data as BalanceSheetStructured).totalLiabilitiesEquity!
        : groups
            .filter(g => /(pasivo|patrimonio|capital)/i.test(g.title))
            .reduce((acc, g) => acc + (g.total || 0), 0)

    return { groups, totals: { assets, liabilitiesEquity } }
  }

  // Caso 2: viene plano por secciones
  const flat = data as BalanceSheetFlat
  const groups: BSGroup[] = []

  if (Array.isArray(flat.assets) && flat.assets.length) {
    groups.push({
      title: 'Activos',
      items: flat.assets,
      total: flat.assets.reduce((acc, it) => acc + (Number(it.amount) || 0), 0),
    })
  }
  if (Array.isArray(flat.liabilities) && flat.liabilities.length) {
    groups.push({
      title: 'Pasivos',
      items: flat.liabilities,
      total: flat.liabilities.reduce((acc, it) => acc + (Number(it.amount) || 0), 0),
    })
  }
  if (Array.isArray(flat.equity) && flat.equity.length) {
    groups.push({
      title: 'Patrimonio',
      items: flat.equity,
      total: flat.equity.reduce((acc, it) => acc + (Number(it.amount) || 0), 0),
    })
  }

  const assets = groups.find(g => /activo/i.test(g.title))?.total || 0
  const liabilitiesEquity =
    (groups.find(g => /pasivo/i.test(g.title))?.total || 0) +
    (groups.find(g => /(patrimonio|capital)/i.test(g.title))?.total || 0)

  return { groups, totals: { assets, liabilitiesEquity } }
}

export default function BalanceSheetPage() {
  const [asOf, setAsOf] = useState<string>(todayISO())
  const [groups, setGroups] = useState<BSGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totals = useMemo(() => {
    const assets =
      groups
        .filter(g => /activo/i.test(g.title))
        .reduce((acc, g) => acc + (g.total || 0), 0) || 0
    const liabilitiesEquity =
      groups
        .filter(g => /(pasivo|patrimonio|capital)/i.test(g.title))
        .reduce((acc, g) => acc + (g.total || 0), 0) || 0
    return { assets, liabilitiesEquity }
  }, [groups])

  async function load(params?: { asOf?: string }) {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get<BalanceSheetAPIResponse>('/accounting/balance-sheet', {
        params: { asOf: params?.asOf ?? asOf },
      })
      const { groups: normGroups, totals: _tot } = normalize(res.data)
      setGroups(normGroups)
      // Si quieres usar _tot directamente en el pie, cambia el cálculo de useMemo por estado.
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          'Error cargando balance general'
      )
      setGroups([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    load({ asOf })
  }

  const exportUrl = `/accounting/export/balance-sheet.csv?${new URLSearchParams({
    asOf,
  }).toString()}`

  return (
    <Protected>
      <Navbar />
      <main className="container mx-auto p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Balance general</h1>
            <p className="text-sm text-gray-500">
              Situación financiera de la empresa a la fecha seleccionada.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a href={exportUrl} className="btn btn-outline">Exportar CSV</a>
            <Link href="/accounting" className="btn btn-ghost">Volver</Link>
          </div>
        </div>

        {/* Filtro de fecha (as-of) */}
        <form onSubmit={onSubmit} className="mb-4 rounded-2xl border bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">Fecha de corte</label>
              <input
                type="date"
                className="input input-bordered w-full rounded-xl"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <button type="submit" className="btn btn-primary w-full md:w-auto" disabled={loading}>
                {loading ? 'Cargando…' : 'Aplicar'}
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4 text-red-700">
              {error}
            </div>
          )}
        </form>

        {/* Contenido */}
        <div className="space-y-6">
          {loading && (
            <div className="rounded-2xl border bg-white p-5 text-center text-gray-500 shadow-sm">
              Cargando…
            </div>
          )}

          {!loading && groups.length === 0 && !error && (
            <div className="rounded-2xl border bg-white p-5 text-center text-gray-500 shadow-sm">
              No hay datos para la fecha seleccionada.
            </div>
          )}

          {/* Render de grupos */}
          {!loading &&
            groups.map((g) => (
              <section key={g.title} className="rounded-2xl border bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-lg font-medium">{g.title}</h2>
                  <div className="text-sm text-gray-600">
                    Total {g.title.toLowerCase()}: <strong>{fmtMoney(g.total || 0)}</strong>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">Código</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">Cuenta</th>
                        <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">Valor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(g.items || []).map((it) => (
                        <tr key={it.code}>
                          <td className="px-4 py-2 text-sm">{it.code}</td>
                          <td className="px-4 py-2 text-sm">{it.name}</td>
                          <td className="px-4 py-2 text-sm text-right">{fmtMoney(it.amount)}</td>
                        </tr>
                      ))}
                      {(!g.items || g.items.length === 0) && (
                        <tr>
                          <td colSpan={3} className="px-4 py-3 text-center text-gray-500">
                            Sin ítems en este grupo.
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td className="px-4 py-2 text-sm font-medium" colSpan={2}>Total {g.title.toLowerCase()}</td>
                        <td className="px-4 py-2 text-sm text-right font-semibold">{fmtMoney(g.total || 0)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>
            ))}

          {/* Totales generales */}
          {!loading && groups.length > 0 && (
            <section className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-xl border bg-emerald-50 p-4 text-emerald-800">
                  <div className="text-xs uppercase tracking-wide opacity-70">Total activos</div>
                  <div className="text-xl font-semibold">{fmtMoney(totals.assets)}</div>
                </div>
                <div className="rounded-xl border bg-blue-50 p-4 text-blue-800">
                  <div className="text-xs uppercase tracking-wide opacity-70">Total pasivos + patrimonio</div>
                  <div className="text-xl font-semibold">{fmtMoney(totals.liabilitiesEquity)}</div>
                </div>
                <div className="rounded-xl border bg-amber-50 p-4 text-amber-800">
                  <div className="text-xs uppercase tracking-wide opacity-70">Diferencia</div>
                  <div className="text-xl font-semibold">
                    {fmtMoney(Number(totals.assets) - Number(totals.liabilitiesEquity))}
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </main>
    </Protected>
  )
}
