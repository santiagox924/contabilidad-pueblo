'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import { USER_ROLES } from '@/lib/roles'
import {
  buildNiifBalanceExportUrl,
  fetchNiifBalance,
  NiifBalanceStatement,
} from '@/lib/accounting-reports'
import { NiifStatementTable } from '@/components/NiifStatementTable'

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

export default function NiifBalancePage() {
  const [asOf, setAsOf] = useState<string>(todayIso())
  const [previousAsOf, setPreviousAsOf] = useState<string>('')
  const [data, setData] = useState<NiifBalanceStatement | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load(params?: { asOf?: string; previousAsOf?: string }) {
    setLoading(true)
    setError(null)
    try {
      const report = await fetchNiifBalance({
        asOf: params?.asOf ?? asOf,
        previousAsOf: params?.previousAsOf ?? (previousAsOf || undefined),
      })
      setData(report)
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          'Error cargando balance NIIF'
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
    load({ asOf, previousAsOf })
  }

  const exportUrl = useMemo(
    () => buildNiifBalanceExportUrl({ asOf, previousAsOf: previousAsOf || undefined }),
    [asOf, previousAsOf]
  )

  const showPrevious = useMemo(() => Boolean(data?.previousAsOf), [data])

  return (
    <Protected roles={[USER_ROLES.ACCOUNTING_ADMIN, USER_ROLES.ACCOUNTANT, USER_ROLES.SUPER_ADMIN]}>
      <Navbar />
      <main className="container mx-auto p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Balance NIIF</h1>
            <p className="text-sm text-gray-500">
              Estado de situación financiera conforme NIIF con opción de comparativo.
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
              <label className="mb-1 block text-sm font-medium">Fecha de corte</label>
              <input
                type="date"
                className="input input-bordered w-full rounded-xl"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Comparativo (opcional)</label>
              <input
                type="date"
                className="input input-bordered w-full rounded-xl"
                value={previousAsOf}
                onChange={(e) => setPreviousAsOf(e.target.value)}
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
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
              {error}
            </div>
          )}
        </form>

        {data && (
          <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <SummaryCard title="Activos" value={data.totals.assets} />
            <SummaryCard title="Pasivos" value={data.totals.liabilities} />
            <SummaryCard title="Patrimonio" value={data.totals.equity} />
          </section>
        )}

        <NiifStatementTable nodes={data?.sections ?? []} showPrevious={showPrevious} />

        {data?.meta?.unmapped && data.meta.unmapped.current.length > 0 && (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <p className="font-semibold mb-2">
              Cuentas sin clasificar: {data.meta.unmapped.current.length}
            </p>
            <p>
              Ajusta el mapeo NIIF para cubrir estas cuentas. Puedes consultar el detalle en la sección de administración contable.
            </p>
          </div>
        )}
      </main>
    </Protected>
  )
}

function SummaryCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
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
