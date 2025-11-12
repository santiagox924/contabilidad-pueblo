'use client'

import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  closePeriodRequest,
  fetchPeriodSummary,
  formatPeriodLabel,
  PeriodSummaryResponse,
} from '@/lib/accounting-periods'

function prevMonthTuple(d = new Date()) {
  // Devuelve {year, month} del mes anterior (1-12)
  const prev = new Date(d.getFullYear(), d.getMonth(), 1)
  prev.setMonth(prev.getMonth() - 1)
  return { year: prev.getFullYear(), month: prev.getMonth() + 1 }
}

const monthsCatalog = [
  { v: 1,  n: 'Enero' }, { v: 2,  n: 'Febrero' }, { v: 3,  n: 'Marzo' },
  { v: 4,  n: 'Abril' }, { v: 5,  n: 'Mayo' },    { v: 6,  n: 'Junio' },
  { v: 7,  n: 'Julio' }, { v: 8,  n: 'Agosto' },  { v: 9,  n: 'Septiembre' },
  { v: 10, n: 'Octubre' }, { v: 11, n: 'Noviembre' }, { v: 12, n: 'Diciembre' },
]

export default function ClosePeriodPage() {
  const def = useMemo(() => prevMonthTuple(), [])
  const [year, setYear] = useState<number>(def.year)
  const [month, setMonth] = useState<number>(def.month)

  const [ack, setAck] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [summary, setSummary] = useState<PeriodSummaryResponse | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const userPickedPeriod = useRef(false)

  const label = useMemo(() => formatPeriodLabel(year, month), [year, month])

  const recentMonths = useMemo(() => {
    if (!summary) return []
    return [...summary.months].slice(-12).reverse()
  }, [summary])

  const selectedInfo = useMemo(() => {
    return summary?.months.find((m) => m.year === year && m.month === month) ?? null
  }, [summary, year, month])

  const availableYears = useMemo(() => {
    const now = new Date().getFullYear()
    const candidate = new Set<number>()
    for (let y = now + 1; y >= now - 5; y--) {
      candidate.add(y)
    }
    summary?.years.forEach((y) => candidate.add(y.year))
    return Array.from(candidate).sort((a, b) => b - a)
  }, [summary])

  const recommendedLabel = useMemo(() => {
    if (!summary?.recommended) return null
    return formatPeriodLabel(summary.recommended.year, summary.recommended.month)
  }, [summary])

  useEffect(() => {
    loadSummary(def.year)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!summary?.recommended || userPickedPeriod.current) return
    setYear(summary.recommended.year)
    setMonth(summary.recommended.month)
  }, [summary])

  async function loadSummary(focusYear?: number) {
    try {
      setSummaryLoading(true)
      setSummaryError(null)
      const data = await fetchPeriodSummary({ months: 24, focusYear })
      setSummary(data)
    } catch (err: any) {
      setSummaryError(err?.response?.data?.message || err?.message || 'No fue posible consultar el estado de los períodos.')
    } finally {
      setSummaryLoading(false)
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!year || !month || month < 1 || month > 12) {
      setError('Selecciona un mes y un año válidos.')
      return
    }
    if (!ack) {
      setError('Debes confirmar que entiendes las implicaciones del cierre.')
      return
    }

    try {
      setSaving(true)
      await closePeriodRequest({ year, month })
      setSuccess(`Período ${label} cerrado correctamente.`)
      setAck(false)
      await loadSummary(year)
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'No se pudo cerrar el período.')
    } finally {
      setSaving(false)
    }
  }

  function handleYearChange(next: number) {
    userPickedPeriod.current = true
    setYear(next)
    setAck(false)
    loadSummary(next)
  }

  function handleMonthChange(next: number) {
    userPickedPeriod.current = true
    setMonth(next)
    setAck(false)
  }

  return (
    <Protected>
      <Navbar />
      <main className="container mx-auto p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Cierre de período</h1>
            <p className="text-sm text-gray-500">
              Revisa los períodos recientes y confirma el cierre del mes correspondiente.
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
              <h2 className="text-lg font-semibold">Estado de períodos recientes</h2>
              <p className="text-sm text-gray-500">
                Verifica borradores pendientes y cierres antes de proceder.
              </p>
            </div>
            <div className="flex flex-col items-start gap-1 md:items-end">
              <span className="text-xs uppercase tracking-wide text-gray-500">Sugerencia de cierre</span>
              <span className="text-sm font-medium text-amber-600">
                {recommendedLabel ?? 'Todos los meses previos están cerrados'}
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
                  <th className="py-2 pr-4">Publicados</th>
                  <th className="py-2 pr-4">Reversados</th>
                  <th className="py-2">Último cierre</th>
                </tr>
              </thead>
              <tbody>
                {summaryLoading && (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-gray-500">
                      Cargando períodos…
                    </td>
                  </tr>
                )}
                {!summaryLoading && recentMonths.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-gray-500">
                      No se encontraron períodos para mostrar.
                    </td>
                  </tr>
                )}
                {!summaryLoading && recentMonths.map((m) => {
                  const periodLabel = formatPeriodLabel(m.year, m.month)
                  return (
                    <tr key={`${m.year}-${m.month}`} className="border-t">
                      <td className="py-2 pr-4 font-medium">{periodLabel}</td>
                      <td className="py-2 pr-4">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${m.status === 'CLOSED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {m.status === 'CLOSED' ? 'Cerrado' : 'Abierto'}
                        </span>
                      </td>
                      <td className="py-2 pr-4">{m.draftEntries}</td>
                      <td className="py-2 pr-4">{m.postedEntries}</td>
                      <td className="py-2 pr-4">{m.reversedEntries}</td>
                      <td className="py-2 text-gray-500">
                        {m.closedAt ? new Date(m.closedAt).toLocaleDateString('es-CO') : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        <form onSubmit={onSubmit} className="space-y-6">
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Mes</label>
                <select
                  className="select select-bordered w-full rounded-xl"
                  value={month}
                  onChange={(e) => handleMonthChange(Number(e.target.value))}
                >
                  {monthsCatalog.map((m) => (
                    <option key={m.v} value={m.v}>{m.n}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Año</label>
                <select
                  className="select select-bordered w-full rounded-xl"
                  value={year}
                  onChange={(e) => handleYearChange(Number(e.target.value))}
                >
                  {availableYears.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-end">
                <div className="w-full rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-800">
                  <div className="text-xs uppercase tracking-wide opacity-70">Período seleccionado</div>
                  <div className="text-sm font-medium">{label}</div>
                  {selectedInfo?.status === 'CLOSED' && (
                    <div className="mt-1 text-xs text-amber-700">Este período ya está cerrado.</div>
                  )}
                </div>
              </div>
            </div>

            {selectedInfo ? (
              selectedInfo.draftEntries ? (
                <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4 text-red-800">
                  Hay {selectedInfo.draftEntries} asientos en estado borrador dentro de {label}. Debes publicarlos o eliminarlos antes de cerrar.
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-700">
                  <p className="text-sm">No se detectaron asientos en borrador para este período.</p>
                </div>
              )
            ) : (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-700">
                <p className="text-sm">Este período aún no aparece en el resumen. Aun así, el backend validará borradores antes de cerrar.</p>
              </div>
            )}

            <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4 text-red-800">
              <p className="font-medium">
                Advertencia: el cierre de {label} es una acción sensible.
              </p>
              <ul className="mt-2 list-disc pl-5 text-sm">
                <li>No podrás registrar asientos normales con fecha en ese período (según políticas del backend).</li>
                <li>Se generan asientos de cierre que afectan resultados y saldos.</li>
              </ul>
              <label className="mt-3 flex items-center gap-2">
                <input
                  type="checkbox"
                  className="checkbox checkbox-error"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                />
                <span className="text-sm">Sí, entiendo y deseo cerrar el período {label}.</span>
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
          </section>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className={`btn btn-error ${(!ack || saving) ? 'btn-disabled pointer-events-none opacity-60' : ''}`}
              disabled={!ack || saving}
            >
              {saving ? 'Cerrando…' : `Cerrar ${label}`}
            </button>
            <Link href="/accounting" className="btn btn-ghost">Cancelar</Link>
          </div>
        </form>
      </main>
    </Protected>
  )
}
