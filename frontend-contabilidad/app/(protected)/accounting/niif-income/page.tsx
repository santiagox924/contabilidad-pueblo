'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import { USER_ROLES } from '@/lib/roles'
import {
  buildNiifIncomeExportUrl,
  fetchNiifIncome,
  NiifIncomeStatement,
} from '@/lib/accounting-reports'
import { NiifStatementTable } from '@/components/NiifStatementTable'

function defaultFrom() {
  const now = new Date()
  return new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10)
}

function defaultTo() {
  return new Date().toISOString().slice(0, 10)
}

export default function NiifIncomePage() {
  const [from, setFrom] = useState<string>(defaultFrom())
  const [to, setTo] = useState<string>(defaultTo())
  const [previousFrom, setPreviousFrom] = useState<string>('')
  const [previousTo, setPreviousTo] = useState<string>('')
  const [accumulateYear, setAccumulateYear] = useState<boolean>(false)

  const [data, setData] = useState<NiifIncomeStatement | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load(params?: {
    from?: string
    to?: string
    previousFrom?: string
    previousTo?: string
    accumulateYear?: boolean
  }) {
    setLoading(true)
    setError(null)
    try {
      const report = await fetchNiifIncome({
        from: params?.from ?? from,
        to: params?.to ?? to,
        previousFrom: params?.previousFrom ?? (previousFrom || undefined),
        previousTo: params?.previousTo ?? (previousTo || undefined),
        accumulateYear:
          params?.accumulateYear ?? (accumulateYear ? true : undefined),
      })
      setData(report)
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          'Error cargando estado de resultados NIIF'
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
    load({ from, to, previousFrom, previousTo, accumulateYear })
  }

  const exportUrl = useMemo(
    () =>
      buildNiifIncomeExportUrl({
        from,
        to,
        previousFrom: previousFrom || undefined,
        previousTo: previousTo || undefined,
        accumulateYear,
      }),
    [from, to, previousFrom, previousTo, accumulateYear]
  )

  const showPrevious = useMemo(
    () => Boolean(data?.previousFrom && data?.previousTo),
    [data]
  )

  return (
    <Protected roles={[USER_ROLES.ACCOUNTING_ADMIN, USER_ROLES.ACCOUNTANT, USER_ROLES.SUPER_ADMIN]}>
      <Navbar />
      <main className="container mx-auto p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Estado de resultados NIIF</h1>
            <p className="text-sm text-gray-500">
              Resultado integral conforme NIIF, con comparativos y opción de acumulado anual.
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
          <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
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
            <div className="flex flex-col justify-center">
              <label className="mb-1 block text-sm font-medium">Acumular año</label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="toggle toggle-primary"
                  checked={accumulateYear}
                  onChange={(e) => setAccumulateYear(e.target.checked)}
                />
                <span>Desde el 1 de enero</span>
              </label>
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
          <div className="mb-6 rounded-2xl border bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Resultado integral del período</p>
            <p className="mt-1 text-2xl font-semibold">
              {new Intl.NumberFormat('es-CO', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }).format(Number(data.totals.netIncome ?? 0))}
            </p>
          </div>
        )}

        <NiifStatementTable nodes={data?.sections ?? []} showPrevious={showPrevious} />

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
