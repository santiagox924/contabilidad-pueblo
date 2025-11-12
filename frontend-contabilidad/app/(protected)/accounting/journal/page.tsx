"use client"

import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import Link from 'next/link'
import { useMemo, useState } from 'react'

function firstDayOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}
function lastDayOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
}

export default function JournalExportPage() {
  const [from, setFrom] = useState<string>(firstDayOfMonth())
  const [to, setTo] = useState<string>(lastDayOfMonth())

  const exportUrl = useMemo(() => {
    const qs = new URLSearchParams({ from, to }).toString()
    return `/accounting/export/journal.csv?${qs}`
  }, [from, to])

  return (
    <Protected>
      <Navbar />
      <main className="container mx-auto p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Diario contable</h1>
            <p className="text-sm text-gray-500">
              Descarga el libro diario (todas las líneas contables) para el rango seleccionado.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a href={exportUrl} className="btn btn-outline" title="Exportar CSV">
              Descargar CSV
            </a>
            <Link href="/accounting" className="btn btn-ghost">
              Volver
            </Link>
          </div>
        </div>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <form
            className="grid grid-cols-1 gap-4 md:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault()
              window.open(exportUrl, '_blank')
            }}
          >
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
              <button type="submit" className="btn btn-primary w-full md:w-auto">
                Descargar
              </button>
            </div>
          </form>
          <p className="mt-4 text-xs text-gray-500">
            El archivo incluye número de asiento, fecha, cuenta, tercero y los valores de débito/crédito
            exactamente como se publicaron en el diario durante el periodo indicado.
          </p>
        </section>
      </main>
    </Protected>
  )
}
