'use client'

import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  closeYearRequest,
  fetchPeriodSummary,
  formatPeriodLabel,
  PeriodSummaryResponse,
  CloseYearResponse,
} from '@/lib/accounting-periods'
import { money } from '@/lib/format'

const yearsBackOptions = 6

export default function CloseYearPage() {
  const defaultYear = new Date().getFullYear() - 1
  const [year, setYear] = useState(defaultYear)
  const [ack, setAck] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [resultInfo, setResultInfo] = useState<CloseYearResponse | null>(null)

  const [summary, setSummary] = useState<PeriodSummaryResponse | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(true)
  const [summaryError, setSummaryError] = useState<string | null>(null)

  const availableYears = useMemo(() => {
    const current = new Date().getFullYear()
    const years: number[] = []
    for (let y = current + 1; y >= current - yearsBackOptions; y--) {
      years.push(y)
    }
    summary?.years.forEach((item) => {
      if (!years.includes(item.year)) years.push(item.year)
    })
    return years.sort((a, b) => b - a)
  }, [summary])

  const selectedYearStats = useMemo(() => {
    return summary?.years.find((y) => y.year === year) ?? null
  }, [summary, year])

  const selectedMonths = useMemo(() => {
    if (!summary) return []
    return summary.months
      .filter((m) => m.year === year)
      .sort((a, b) => a.month - b.month)
  }, [summary, year])

  const readyToClose = Boolean(selectedYearStats?.fullyClosed)

  useEffect(() => {
    loadSummary(defaultYear)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadSummary(focusYear: number) {
    try {
      setLoadingSummary(true)
      setSummaryError(null)
      const data = await fetchPeriodSummary({ months: 60, focusYear })
      setSummary(data)
    } catch (err: any) {
      setSummaryError(err?.response?.data?.message || err?.message || 'No fue posible consultar el estado de los períodos.')
    } finally {
      setLoadingSummary(false)
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setResultInfo(null)

    if (!ack) {
      setError('Debes confirmar que comprendes el cierre anual.')
      return
    }
    if (!readyToClose) {
      setError('Debes cerrar los 12 períodos del año antes de ejecutar el cierre anual.')
      return
    }

    try {
      setSaving(true)
      const response = await closeYearRequest({ year })
      setResultInfo(response)
      setSuccess(`Cierre anual ${year} ejecutado correctamente.`)
      setAck(false)
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'No fue posible cerrar el año fiscal.')
    } finally {
      setSaving(false)
    }
  }

  function handleYearChange(nextYear: number) {
    setYear(nextYear)
    setAck(false)
    setSuccess(null)
    setError(null)
    setResultInfo(null)
    loadSummary(nextYear)
  }

  return (
    <Protected>
      <Navbar />
      <main className="container mx-auto p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Cierre anual</h1>
            <p className="text-sm text-gray-500">
              Consolida los resultados del ejercicio trasladándolos a cuentas patrimoniales.
            </p>
          </div>
          <Link href="/accounting" className="btn btn-ghost">Volver</Link>
        </div>

        {summaryError && (
          <div className="mb-6 rounded-2xl border border-red-300 bg-red-50 p-4 text-red-700">
            {summaryError}
          </div>
        )}

        <section className="mb-6 rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Estado de períodos del año {year}</h2>
              <p className="text-sm text-gray-500">
                Debes contar con los 12 meses cerrados para ejecutar el cierre anual.
              </p>
            </div>
            <div className="flex flex-col items-start gap-1 md:items-end">
              <span className="text-xs uppercase tracking-wide text-gray-500">Resumen</span>
              <span className="text-sm font-medium text-slate-700">
                {selectedYearStats
                  ? `${selectedYearStats.closedMonths} de ${selectedYearStats.totalMonths} meses cerrados`
                  : 'Sin información disponible'}
              </span>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-4">Período</th>
                  <th className="py-2 pr-4">Estado</th>
                  <th className="py-2 pr-4">Borradores</th>
                  <th className="py-2">Cierre</th>
                </tr>
              </thead>
              <tbody>
                {loadingSummary && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-gray-500">Cargando períodos…</td>
                  </tr>
                )}
                {!loadingSummary && selectedMonths.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-gray-500">No hay períodos registrados para este año.</td>
                  </tr>
                )}
                {!loadingSummary && selectedMonths.map((m) => (
                  <tr key={`${m.year}-${m.month}`} className="border-t">
                    <td className="py-2 pr-4 font-medium">{formatPeriodLabel(m.year, m.month)}</td>
                    <td className="py-2 pr-4">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${m.status === 'CLOSED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {m.status === 'CLOSED' ? 'Cerrado' : 'Abierto'}
                      </span>
                    </td>
                    <td className="py-2 pr-4">{m.draftEntries}</td>
                    <td className="py-2 text-gray-500">{m.closedAt ? new Date(m.closedAt).toLocaleDateString('es-CO') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <form onSubmit={onSubmit} className="space-y-6">
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Año fiscal</label>
                <select
                  className="select select-bordered w-full rounded-xl"
                  value={year}
                  onChange={(e) => handleYearChange(Number(e.target.value))}
                >
                  {availableYears.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <div className={`rounded-xl border ${readyToClose ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-amber-300 bg-amber-50 text-amber-800'} p-3`}>
                  <div className="text-xs uppercase tracking-wide opacity-70">Preparación</div>
                  <div className="text-sm font-medium">
                    {readyToClose
                      ? 'Todos los períodos del año están cerrados.'
                      : 'Asegúrate de cerrar los 12 meses antes de continuar.'}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4 text-red-800">
              <p className="font-medium">Advertencia del cierre anual.</p>
              <ul className="mt-2 list-disc pl-5 text-sm">
                <li>Se generan asientos que trasladan saldos de resultados a cuentas patrimoniales.</li>
                <li>La operación es idempotente por año; si ya se ejecutó, reutilizará los asientos.</li>
                <li>Verifica que los estados financieros del año queden definitivos antes de cerrar.</li>
              </ul>
              <label className="mt-3 flex items-center gap-2">
                <input
                  type="checkbox"
                  className="checkbox checkbox-error"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                />
                <span className="text-sm">Sí, entiendo y deseo cerrar el año fiscal {year}.</span>
              </label>
            </div>

            {error && (
              <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4 text-red-700">
                {error}
              </div>
            )}
            {success && !error && (
              <div className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-800">
                {success}
              </div>
            )}

            {resultInfo && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <p className="font-medium">Detalle del cierre</p>
                <ul className="mt-2 space-y-1">
                  <li>Resultado del ejercicio: <span className="font-semibold">{money(resultInfo.result ?? 0)}</span></li>
                  <li>Asiento de cierre: #{resultInfo.entry1?.id ?? 'N/A'}</li>
                  <li>Traslado a patrimonio: {resultInfo.entry2 ? `#${resultInfo.entry2.id}` : 'No aplica'}</li>
                </ul>
              </div>
            )}
          </section>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className={`btn btn-error ${(!ack || saving) ? 'btn-disabled pointer-events-none opacity-60' : ''}`}
              disabled={!ack || saving}
            >
              {saving ? 'Cerrando…' : `Cerrar año ${year}`}
            </button>
            <Link href="/accounting" className="btn btn-ghost">Cancelar</Link>
          </div>
        </form>
      </main>
    </Protected>
  )
}
