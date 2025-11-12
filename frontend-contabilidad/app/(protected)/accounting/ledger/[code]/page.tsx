'use client'

import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { LedgerResponse, RawLedgerResponse, normalizeLedgerResponse } from '@/lib/ledger'

function fmtMoney(n: number) {
  return Number(n || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function firstDayOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}
function lastDayOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
}

type PageProps = {
  params: { code: string }
  searchParams?: { from?: string; to?: string }
}

export default function LedgerByCodePage({ params, searchParams }: PageProps) {
  const initialFrom = searchParams?.from || firstDayOfMonth()
  const initialTo = searchParams?.to || lastDayOfMonth()

  const [from, setFrom] = useState<string>(initialFrom)
  const [to, setTo] = useState<string>(initialTo)
  const [data, setData] = useState<LedgerResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const code = decodeURIComponent(params.code || '')

  async function load() {
    if (!code) {
      setError('Código de cuenta inválido.')
      setData(null)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const res = await api.get<RawLedgerResponse>(`/accounting/ledger/${encodeURIComponent(code)}`, {
        params: { from, to },
      })
      setData(normalizeLedgerResponse(res.data, code))
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Error cargando el libro mayor')
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    load()
  }

  const exportUrl = useMemo(() => {
    const qs = new URLSearchParams({ from, to }).toString()
    return `/accounting/export/ledger/${encodeURIComponent(code)}.csv?${qs}`
  }, [code, from, to])

  const opening = data?.opening ?? 0
  const ledgerLines = data?.lines ?? []
  const hasOpeningBalance = Math.abs(opening) > 0.00001
  const hasLines = ledgerLines.length > 0
  const canExport = !!data && (hasLines || hasOpeningBalance)
  const isEmpty = !loading && !hasLines && !hasOpeningBalance

  const totals = useMemo(() => {
    const lines = ledgerLines
    const debit = lines.reduce((acc, l) => acc + (Number(l.debit) || 0), 0)
    const credit = lines.reduce((acc, l) => acc + (Number(l.credit) || 0), 0)
    const finalBalance = lines.length ? lines[lines.length - 1].balance : opening
    return { debit, credit, finalBalance }
  }, [ledgerLines, opening])
  const closing = data?.closing ?? totals.finalBalance

  return (
    <Protected>
      <Navbar />
      <main className="container mx-auto p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Libro mayor — {code}
            </h1>
            <p className="text-sm text-gray-500">
              {data?.account?.name ? `Cuenta: ${data.account.name}` : 'Movimientos por cuenta contable.'}
            </p>
            <p className="text-xs text-gray-400">
              Período: {from} — {to}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={exportUrl}
              className={`btn btn-outline ${!canExport ? 'btn-disabled pointer-events-none opacity-50' : ''}`}
              title={!canExport ? 'No hay datos para exportar' : 'Exportar CSV'}
            >
              Exportar CSV
            </a>
            <Link href="/accounting/ledger" className="btn btn-ghost">
              Volver
            </Link>
          </div>
        </div>

        {/* Filtros */}
        <form onSubmit={onSubmit} className="mb-4 rounded-2xl border bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="ledger-from">Desde</label>
              <input
                id="ledger-from"
                type="date"
                className="input input-bordered w-full rounded-xl"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="ledger-to">Hasta</label>
              <input
                id="ledger-to"
                type="date"
                className="input input-bordered w-full rounded-xl"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <button type="submit" className="btn btn-primary w-full md:w-auto" disabled={loading}>
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
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">Fecha</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">Descripción</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">Doc/Ref</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">Débito</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">Crédito</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-4 text-center text-gray-500">
                    Cargando…
                  </td>
                </tr>
              )}

              {!loading && data && hasOpeningBalance && (
                <tr className="bg-gray-50/60">
                  <td className="px-4 py-2 text-sm">—</td>
                  <td className="px-4 py-2 text-sm">Saldo inicial</td>
                  <td className="px-4 py-2 text-sm">-</td>
                  <td className="px-4 py-2 text-sm text-right">-</td>
                  <td className="px-4 py-2 text-sm text-right">-</td>
                  <td className="px-4 py-2 text-sm text-right font-semibold">{fmtMoney(opening)}</td>
                </tr>
              )}

              {!loading && ledgerLines.map((ln, idx) => (
                <tr key={`${ln.date}-${idx}`}>
                  <td className="px-4 py-2 text-sm">{ln.date}</td>
                  <td className="px-4 py-2 text-sm">{ln.description || '-'}</td>
                  <td className="px-4 py-2 text-sm">{ln.docRef || '-'}</td>
                  <td className="px-4 py-2 text-sm text-right">{fmtMoney(ln.debit)}</td>
                  <td className="px-4 py-2 text-sm text-right">{fmtMoney(ln.credit)}</td>
                  <td className="px-4 py-2 text-sm text-right">{fmtMoney(ln.balance)}</td>
                </tr>
              ))}

              {isEmpty && (
                <tr>
                  <td colSpan={6} className="px-4 py-4 text-center text-gray-500">
                    No hay movimientos para el rango seleccionado.
                  </td>
                </tr>
              )}
            </tbody>

            {/* Totales */}
            {!loading && (hasLines || hasOpeningBalance) ? (
              <tfoot className="bg-gray-50">
                <tr>
                  <td className="px-4 py-2 text-sm font-medium" colSpan={3}>Totales</td>
                  <td className="px-4 py-2 text-sm text-right font-semibold">{fmtMoney(totals.debit)}</td>
                  <td className="px-4 py-2 text-sm text-right font-semibold">{fmtMoney(totals.credit)}</td>
                  <td className="px-4 py-2 text-sm text-right text-gray-600">{fmtMoney(totals.finalBalance)}</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 text-sm" colSpan={5}>Saldo final</td>
                  <td className="px-4 py-2 text-sm text-right font-semibold">{fmtMoney(closing)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </main>
    </Protected>
  )
}
