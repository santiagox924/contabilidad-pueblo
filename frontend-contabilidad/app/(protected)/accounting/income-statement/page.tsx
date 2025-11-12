'use client'

import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'

interface IncomeStatementLine {
  code: string
  name: string
  amount: number
}

// La API podría devolver { lines, total } o directamente IncomeStatementLine[]
type IncomeStatementAPIResponse =
  | { lines: IncomeStatementLine[]; total?: number }
  | IncomeStatementLine[]

function fmtMoney(n: number) {
  return Number(n || 0).toLocaleString('es-CO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function firstDayOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}
function lastDayOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
}

export default function IncomeStatementPage() {
  const [from, setFrom] = useState<string>(firstDayOfMonth())
  const [to, setTo] = useState<string>(lastDayOfMonth())

  const [lines, setLines] = useState<IncomeStatementLine[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const total = useMemo(
    () => lines.reduce((acc, l) => acc + (Number(l.amount) || 0), 0),
    [lines]
  )

  async function load(params?: { from?: string; to?: string }) {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get<IncomeStatementAPIResponse>(
        '/accounting/income-statement',
        {
          params: {
            from: params?.from ?? from,
            to: params?.to ?? to,
          },
        }
      )
      const data = res.data
      if (Array.isArray(data)) {
        setLines(data)
      } else if (data && Array.isArray(data.lines)) {
        setLines(data.lines)
      } else {
        // Respuesta inesperada: dejamos vacío
        setLines([])
      }
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          'Error cargando estado de resultados'
      )
      setLines([])
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
    load({ from, to })
  }

  const exportUrl = useMemo(() => {
    const qs = new URLSearchParams({ from, to }).toString()
    return `/accounting/export/income-statement.csv?${qs}`
  }, [from, to])

  return (
    <Protected>
      <Navbar />
      <main className="container mx-auto p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Estado de resultados</h1>
            <p className="text-sm text-gray-500">
              Ingresos, costos y gastos del periodo seleccionado.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={exportUrl}
              className="btn btn-outline"
              title="Exportar CSV"
            >
              Exportar CSV
            </a>
            <Link href="/accounting" className="btn btn-ghost">Volver</Link>
          </div>
        </div>

        {/* Filtros */}
        <form onSubmit={onSubmit} className="mb-4 rounded-2xl border bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="block text-sm font-medium mb-1">Desde</label>
              <input
                type="date"
                className="input input-bordered w-full rounded-xl"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Hasta</label>
              <input
                type="date"
                className="input input-bordered w-full rounded-xl"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                className="btn btn-primary w-full md:w-auto"
                disabled={loading}
              >
                {loading ? 'Cargando…' : 'Aplicar filtros'}
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4 text-red-700">
              {error}
            </div>
          )}
        </form>

        {/* Tabla */}
        <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">Código</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">Cuenta / Concepto</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr>
                  <td colSpan={3} className="px-4 py-4 text-center text-gray-500">
                    Cargando…
                  </td>
                </tr>
              )}

              {!loading && lines.map((ln) => (
                <tr key={ln.code}>
                  <td className="px-4 py-2 text-sm">{ln.code}</td>
                  <td className="px-4 py-2 text-sm">{ln.name}</td>
                  <td className="px-4 py-2 text-sm text-right">{fmtMoney(ln.amount)}</td>
                </tr>
              ))}

              {!loading && lines.length === 0 && !error && (
                <tr>
                  <td colSpan={3} className="px-4 py-4 text-center text-gray-500">
                    No hay datos para el rango seleccionado.
                  </td>
                </tr>
              )}
            </tbody>

            {/* Total */}
            {!loading && lines.length > 0 && (
              <tfoot className="bg-gray-50">
                <tr>
                  <td className="px-4 py-2 text-sm font-medium" colSpan={2}>Resultado del período</td>
                  <td className="px-4 py-2 text-sm text-right font-semibold">
                    {fmtMoney(total)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </main>
    </Protected>
  )
}
