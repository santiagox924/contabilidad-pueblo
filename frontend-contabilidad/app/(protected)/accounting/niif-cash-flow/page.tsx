'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import { USER_ROLES } from '@/lib/roles'
import {
  buildNiifCashFlowExportUrl,
  fetchNiifCashFlow,
  NiifCashFlowStatement,
} from '@/lib/accounting-reports'
import { NiifStatementTable } from '@/components/NiifStatementTable'

function defaultFrom() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
}

function defaultTo() {
  return new Date().toISOString().slice(0, 10)
}

export default function NiifCashFlowPage() {
  const [from, setFrom] = useState<string>(defaultFrom())
  const [to, setTo] = useState<string>(defaultTo())
  const [previousFrom, setPreviousFrom] = useState<string>('')
  const [previousTo, setPreviousTo] = useState<string>('')

  const [data, setData] = useState<NiifCashFlowStatement | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load(params?: {
    from?: string
    to?: string
    previousFrom?: string
    previousTo?: string
  }) {
    setLoading(true)
    setError(null)
    try {
      const report = await fetchNiifCashFlow({
        from: params?.from ?? from,
        to: params?.to ?? to,
        previousFrom: params?.previousFrom ?? (previousFrom || undefined),
        previousTo: params?.previousTo ?? (previousTo || undefined),
      })
      setData(report)
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          'Error cargando flujo de efectivo NIIF'
      )
      setData(null)
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
    load({ from, to, previousFrom, previousTo })
  }

  const exportUrl = useMemo(
    () =>
      buildNiifCashFlowExportUrl({
        from,
        to,
        previousFrom: previousFrom || undefined,
        previousTo: previousTo || undefined,
      }),
    [from, to, previousFrom, previousTo]
  )

  const showPrevious = useMemo(
    () => Boolean(data?.previousFrom && data?.previousTo),
    [data]
  )

  const checks = data?.meta?.checks ?? null

  return (
    <Protected roles={[USER_ROLES.ACCOUNTING_ADMIN, USER_ROLES.ACCOUNTANT, USER_ROLES.SUPER_ADMIN]}>
      <Navbar />
      <main className="container mx-auto p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Flujo de efectivo NIIF</h1>
            <p className="text-sm text-gray-500">
              Desglose de flujos operativos, de inversión y financiación con conciliación de efectivo.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a href={exportUrl} className="btn btn-outline" title="Exportar CSV">
              Exportar CSV
            </a>
            <Link href="/accounting" className="btn btn-ghost">
              Volver
            </Link>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="mb-4 rounded-2xl border bg-white p-5 shadow-sm"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Desde</label>
              <input
                type="date"
                className="input input-bordered w-full rounded-xl"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Hasta</label>
              <input
                type="date"
                className="input input-bordered w-full rounded-xl"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Comparativo desde</label>
              <input
                type="date"
                className="input input-bordered w-full rounded-xl"
                value={previousFrom}
                onChange={(e) => setPreviousFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Comparativo hasta</label>
              <input
                type="date"
                className="input input-bordered w-full rounded-xl"
                value={previousTo}
                onChange={(e) => setPreviousTo(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            {error && (
              <div className="flex-1 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {error}
              </div>
            )}
            <button
              type="submit"
              className="btn btn-primary md:w-auto"
              disabled={loading}
            >
              {loading ? 'Cargando…' : 'Aplicar filtros'}
            </button>
          </div>
        </form>

        {data && (
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
            <Summary title="Cambio neto" value={data.totals.netChange} />
            {checks && (
              <>
                <Summary title="Apertura efectivo" value={checks.openingCash ?? 0} />
                <Summary title="Cierre efectivo" value={checks.closingCash ?? 0} />
                <Summary title="Diferencia conciliación" value={checks.reconciliationDiff ?? 0} highlight />
              </>
            )}
          </div>
        )}

        <NiifStatementTable nodes={data?.sections ?? []} showPrevious={showPrevious} />

        {checks && Math.abs(checks.reconciliationDiff ?? 0) > 1 && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Existe una diferencia entre el cambio neto y la variación del efectivo: {new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(checks.reconciliationDiff ?? 0)}.
          </div>
        )}

        {data?.meta?.unmapped && data.meta.unmapped.current.length > 0 && (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <p className="mb-1 font-semibold">
              Hay {data.meta.unmapped.current.length} cuentas sin clasificar en el mapeo NIIF.
            </p>
            <p>Ajusta la configuración para mejorar la presentación del informe.</p>
          </div>
        )}
      </main>
    </Protected>
  )
}

function Summary({ title, value, highlight }: { title: string; value: number; highlight?: boolean }) {
  return (
    <div
      className={`rounded-2xl border bg-white p-5 shadow-sm ${highlight ? 'border-amber-300 bg-amber-50' : ''}`}
    >
      <p className="text-sm text-gray-500">{title}</p>
      <p className="mt-1 text-2xl font-semibold">
        {new Intl.NumberFormat('es-CO', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(Number(value ?? 0))}
      </p>
    </div>
  )
}
