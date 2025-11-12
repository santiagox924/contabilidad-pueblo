'use client'

import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api' // axios instance (named export), p.ej.: export const api = axios.create({...})

type Side = 'D' | 'C' | 'DEBIT' | 'CREDIT' | null

interface TrialBalanceRow {
  code: string
  name: string
  debit: number
  credit: number
  balanceSide: Side
  balance: number
}

interface TrialBalanceResponse {
  rows?: TrialBalanceRow[]
  totals?: { debit: number; credit: number }
  from?: string
  to?: string
  count?: number
}

function fmtMoney(n: number) {
  return Number(n || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatBalance(side: Side, amount: number) {
  const isDebit = side === 'D' || side === 'DEBIT'
  const isCredit = side === 'C' || side === 'CREDIT'
  if (!isDebit && !isCredit) return fmtMoney(0)
  const label = isDebit ? 'D' : 'C'
  return `${label} ${fmtMoney(Math.abs(amount))}`
}

function firstDayOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}
function lastDayOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
}

export default function BalanceTrialPage() {
  const [from, setFrom] = useState<string>(firstDayOfMonth())
  const [to, setTo] = useState<string>(lastDayOfMonth())
  const [rows, setRows] = useState<TrialBalanceRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totals = useMemo(() => {
    const debit = rows.reduce((acc, r) => acc + (Number(r.debit) || 0), 0)
    const credit = rows.reduce((acc, r) => acc + (Number(r.credit) || 0), 0)
    return { debit, credit }
  }, [rows])

  async function loadData(params?: { from?: string; to?: string }) {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get<TrialBalanceResponse | TrialBalanceRow[]>(
        '/accounting/trial-balance',
        {
        params: {
          from: params?.from ?? from,
          to: params?.to ?? to,
        },
        },
      )
      const payload = res.data
      if (Array.isArray(payload)) {
        setRows(payload)
      } else {
        setRows(Array.isArray(payload?.rows) ? payload.rows : [])
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Error cargando balance de prueba')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // carga inicial
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    loadData({ from, to })
  }

  const exportUrl = useMemo(() => {
    const qs = new URLSearchParams({ from, to }).toString()
    return `/accounting/export/trial-balance.csv?${qs}`
  }, [from, to])

  return (
    <Protected>
      <Navbar />
      <main className="container mx-auto p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Balance de prueba</h1>
            <p className="text-sm text-gray-500">
              Resumen de débitos y créditos por cuenta en un rango de fechas.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={exportUrl}
              className="btn btn-outline"
              // Nota: si tu backend exige Authorization también para CSV,
              // considera implementar un fetch+Blob en otra iteración.
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
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">Cuenta</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">Débito</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">Crédito</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-center text-gray-500">
                    Cargando…
                  </td>
                </tr>
              )}

              {!loading && rows.map((r) => (
                <tr key={r.code}>
                  <td className="px-4 py-2 text-sm">{r.code}</td>
                  <td className="px-4 py-2 text-sm">{r.name}</td>
                  <td className="px-4 py-2 text-sm text-right">{fmtMoney(r.debit)}</td>
                  <td className="px-4 py-2 text-sm text-right">{fmtMoney(r.credit)}</td>
                  <td className="px-4 py-2 text-sm text-right">{formatBalance(r.balanceSide, r.balance)}</td>
                </tr>
              ))}

              {!loading && rows.length === 0 && !error && (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-center text-gray-500">
                    No hay datos para el rango seleccionado.
                  </td>
                </tr>
              )}
            </tbody>

            {/* Totales pie */}
            {!loading && rows.length > 0 && (
              <tfoot className="bg-gray-50">
                <tr>
                  <td className="px-4 py-2 text-sm font-medium" colSpan={2}>Totales</td>
                  <td className="px-4 py-2 text-sm text-right font-semibold">{fmtMoney(totals.debit)}</td>
                  <td className="px-4 py-2 text-sm text-right font-semibold">{fmtMoney(totals.credit)}</td>
                  <td className="px-4 py-2 text-sm text-right text-gray-500">
                    {fmtMoney(Math.abs(totals.debit - totals.credit))}
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
